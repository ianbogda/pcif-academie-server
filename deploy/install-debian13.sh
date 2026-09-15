#!/usr/bin/env bash
set -Eeuo pipefail
ENVIRONMENT=""
ADMIN_EMAIL=""
ADMIN_NAME="Administrateur PCIF Académie"
ACME_EMAIL=""
SMTP_HOST=""; SMTP_PORT="587"; SMTP_USER=""; SMTP_PASSWORD=""; SMTP_FROM=""
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  echo 'Production : sudo ./deploy/install-debian13.sh --environment prod --admin-email admin@domaine.fr --acme-email certificats@domaine.fr [--smtp-host serveur --smtp-user compte --smtp-password secret --smtp-from adresse]'
  echo 'Démo       : sudo ./deploy/install-debian13.sh --environment demo --acme-email certificats@domaine.fr'
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --admin-name) ADMIN_NAME="${2:-}"; shift 2 ;;
    --acme-email) ACME_EMAIL="${2:-}"; shift 2 ;;
    --smtp-host) SMTP_HOST="${2:-}"; shift 2 ;;
    --smtp-port) SMTP_PORT="${2:-}"; shift 2 ;;
    --smtp-user) SMTP_USER="${2:-}"; shift 2 ;;
    --smtp-password) SMTP_PASSWORD="${2:-}"; shift 2 ;;
    --smtp-from) SMTP_FROM="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; usage; exit 1 ;;
  esac
done
[[ $EUID -eq 0 ]] || { echo "Lancer avec sudo/root." >&2; exit 1; }
[[ "$ENVIRONMENT" == "prod" || "$ENVIRONMENT" == "demo" ]] || { usage; exit 1; }
. /etc/os-release
[[ "$ID" == "debian" ]] || { echo "Debian requis." >&2; exit 1; }

if [[ "$ENVIRONMENT" == "prod" ]]; then
  [[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
    echo "--admin-email est obligatoire et doit être valide en production." >&2; exit 1;
  }
  read -r -s -p "Mot de passe de l'administrateur initial (12 caractères minimum) : " ADMIN_PASSWORD; echo
  read -r -s -p "Confirmation du mot de passe : " ADMIN_PASSWORD_CONFIRM; echo
  [[ ${#ADMIN_PASSWORD} -ge 12 ]] || { echo "Mot de passe trop court." >&2; exit 1; }
  [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] || { echo "Les mots de passe diffèrent." >&2; exit 1; }
fi
[[ -n "$ACME_EMAIL" ]] || ACME_EMAIL="$ADMIN_EMAIL"
[[ "$ACME_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
  echo "--acme-email est obligatoire en démo et doit être valide." >&2; exit 1;
}

APP_USER="pcif-${ENVIRONMENT}"
APP_DIR="/opt/pcif-academie-${ENVIRONMENT}"
DB_NAME="pcif_academie_${ENVIRONMENT}"
DB_USER="pcif_${ENVIRONMENT}_app"
SERVICE="pcif-academie-${ENVIRONMENT}"
if [[ "$ENVIRONMENT" == "prod" ]]; then
  DOMAIN="pcif.eple-tools.fr"; PORT=3000
else
  DOMAIN="demopcif.eple-tools.fr"; PORT=3001
fi
trap 'echo "Erreur ligne $LINENO" >&2; exit 1' ERR

echo "==> Paquets système"
apt-get update
apt-get install -y ca-certificates curl gnupg postgresql postgresql-client openssl rsync
if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)" -lt 20 ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

echo "==> Compte système et fichiers ${ENVIRONMENT}"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
rsync -a --delete --exclude node_modules --exclude web/node_modules --exclude dist --exclude web/dist --exclude .git --exclude .env "$SOURCE_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> PostgreSQL ${ENVIRONMENT}"
systemctl enable --now postgresql
DB_PASSWORD="$(openssl rand -hex 24)"
sudo -u postgres psql -v ON_ERROR_STOP=1 --set=db_user="$DB_USER" --set=db_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname=:'db_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'db_user', :'db_password') \gexec
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

JWT_SECRET="$(openssl rand -hex 48)"
cat >"$APP_DIR/.env" <<EOF
NODE_ENV=production
DEPLOYMENT_ENV=${ENVIRONMENT}
HOST=127.0.0.1
PORT=${PORT}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=https://${DOMAIN}
PUBLIC_APP_URL=https://${DOMAIN}
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=false
SMTP_USER=${SMTP_USER}
SMTP_PASSWORD=${SMTP_PASSWORD}
SMTP_FROM=${SMTP_FROM:-$SMTP_USER}
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

echo "==> Dépendances, base et builds"
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then sudo -u "$APP_USER" npm ci; else sudo -u "$APP_USER" npm install; fi
sudo -u "$APP_USER" npm run db:init
sudo -u "$APP_USER" npm run db:reference
if [[ "$ENVIRONMENT" == "demo" ]]; then
  sudo -u "$APP_USER" npm run db:seed
  sudo -u "$APP_USER" npm run db:demo-sync
else
  printf '%s' "$ADMIN_PASSWORD" | sudo -u "$APP_USER" npm run admin:create -- --initial --email "$ADMIN_EMAIL" --name "$ADMIN_NAME" --password-stdin
  unset ADMIN_PASSWORD ADMIN_PASSWORD_CONFIRM
fi
sudo -u "$APP_USER" npm run db:reference-check
sudo -u "$APP_USER" npm run check
sudo -u "$APP_USER" npm run build
cd "$APP_DIR/web"
if [[ -f package-lock.json ]]; then sudo -u "$APP_USER" npm ci; else sudo -u "$APP_USER" npm install; fi
sudo -u "$APP_USER" env VITE_DEPLOYMENT_ENV="$ENVIRONMENT" npm run build

echo "==> Service ${SERVICE}"
cat >"/etc/systemd/system/${SERVICE}.service" <<EOF
[Unit]
Description=PCIF Académie (${ENVIRONMENT})
After=network.target postgresql.service
Requires=postgresql.service
[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/dist/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}
UMask=0077
[Install]
WantedBy=multi-user.target
EOF

if [[ "$ENVIRONMENT" == "demo" ]]; then
  install -m 0750 -o root -g root "$APP_DIR/deploy/reset-demo.sh" /usr/local/sbin/pcif-academie-demo-reset
  cat >/etc/systemd/system/pcif-academie-demo-reset.service <<EOF
[Unit]
Description=Remise à zéro des données PCIF Académie Démo
After=postgresql.service
[Service]
Type=oneshot
Environment=PCIF_DEMO_APP_DIR=${APP_DIR}
Environment=PCIF_DEMO_SERVICE=${SERVICE}
ExecStart=/usr/local/sbin/pcif-academie-demo-reset
EOF
  cat >/etc/systemd/system/pcif-academie-demo-reset.timer <<'EOF'
[Unit]
Description=RAZ horaire de PCIF Académie Démo
[Timer]
OnCalendar=hourly
RandomizedDelaySec=30
Unit=pcif-academie-demo-reset.service
[Install]
WantedBy=timers.target
EOF
fi

echo "==> Caddy + HTTPS"
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi
install -d -m 0755 /etc/caddy/sites
remove_legacy_caddy_site() {
  local config=/etc/caddy/Caddyfile
  grep -Fq "$DOMAIN {" "$config" 2>/dev/null || return 0
  cp -a "$config" "${config}.before-pcif-${ENVIRONMENT}-$(date +%Y%m%d%H%M%S).bak"
  awk -v target="$DOMAIN {" '
    {
      line=$0
      trimmed=line
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", trimmed)
      if (!skip && trimmed==target) { skip=1; depth=0 }
      if (skip) {
        opens=gsub(/\{/, "{", line)
        closes=gsub(/\}/, "}", line)
        depth+=opens-closes
        if (depth<=0) skip=0
        next
      }
      print
    }
  ' "$config" >"${config}.pcif-new"
  install -m 0644 "${config}.pcif-new" "$config"
  rm -f "${config}.pcif-new"
  echo "Ancien bloc Caddy ${DOMAIN} migré vers /etc/caddy/sites/."
}
remove_legacy_caddy_site
grep -q '^import sites/\*$' /etc/caddy/Caddyfile 2>/dev/null || printf '\nimport sites/*\n' >>/etc/caddy/Caddyfile
cat >"/etc/caddy/sites/pcif-academie-${ENVIRONMENT}.caddy" <<EOF
${DOMAIN} {
  encode zstd gzip
  tls {
    issuer acme {
      email ${ACME_EMAIL}
    }
  }
  handle /api/* {
    reverse_proxy 127.0.0.1:${PORT}
  }
  handle /health {
    reverse_proxy 127.0.0.1:${PORT}
  }
  handle {
    root * ${APP_DIR}/web/dist
    try_files {path} /index.html
    file_server
  }
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
  }
}
EOF

systemctl daemon-reload
if [[ "$ENVIRONMENT" == "prod" ]] && systemctl is-active --quiet pcif-academie.service 2>/dev/null; then
  echo "==> Arrêt de l'ancien service pcif-academie qui occupe le port 3000"
  systemctl disable --now pcif-academie.service
fi
systemctl enable --now "$SERVICE"
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

API_READY=0
for ((attempt=1; attempt<=30; attempt++)); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    API_READY=1
    break
  fi
  sleep 1
done
if [[ "$API_READY" -ne 1 ]]; then
  echo "L'API ${ENVIRONMENT} ne répond pas correctement après 30 secondes." >&2
  systemctl status "$SERVICE" --no-pager -l || true
  journalctl -u "$SERVICE" -n 80 --no-pager || true
  exit 1
fi
curl -fsS --retry 6 --retry-delay 5 "https://${DOMAIN}/health" >/dev/null
if [[ "$ENVIRONMENT" == "demo" ]]; then
  systemctl enable --now pcif-academie-demo-reset.timer
fi
echo "Installation ${ENVIRONMENT} terminée : https://${DOMAIN}"
[[ "$ENVIRONMENT" == "demo" ]] && echo "Prochaine RAZ : systemctl list-timers pcif-academie-demo-reset.timer"
