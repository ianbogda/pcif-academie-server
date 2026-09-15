#!/usr/bin/env bash
set -Eeuo pipefail
ENVIRONMENT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    *) echo "Usage : sudo ./deploy/update-debian13.sh --environment prod|demo" >&2; exit 1 ;;
  esac
done
[[ $EUID -eq 0 ]] || { echo "Lancer avec sudo/root." >&2; exit 1; }
[[ "$ENVIRONMENT" == "prod" || "$ENVIRONMENT" == "demo" ]] || {
  echo "Usage : sudo ./deploy/update-debian13.sh --environment prod|demo" >&2; exit 1;
}
APP="/opt/pcif-academie-${ENVIRONMENT}"
APP_USER="pcif-${ENVIRONMENT}"
SERVICE="pcif-academie-${ENVIRONMENT}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$ENVIRONMENT" == "prod" ]]; then
  PORT=3000; DOMAIN="pcif.eple-tools.fr"
else
  PORT=3001; DOMAIN="demopcif.eple-tools.fr"
fi
HEALTH_URL="http://127.0.0.1:${PORT}/health"
[[ -f "$APP/.env" ]] || { echo "Installation ${ENVIRONMENT} introuvable dans $APP." >&2; exit 1; }

log(){ printf '\n==> %s\n' "$*"; }
fail(){
  echo "ERREUR : $*" >&2
  systemctl status "$SERVICE" --no-pager -l || true
  journalctl -u "$SERVICE" -n 80 --no-pager || true
  exit 1
}

log "Arrêt du service ${ENVIRONMENT}"
if [[ "$ENVIRONMENT" == "demo" ]]; then
  systemctl stop pcif-academie-demo-reset.timer 2>/dev/null || true
fi
systemctl stop "$SERVICE" 2>/dev/null || true
if [[ "$ENVIRONMENT" == "prod" ]] && systemctl is-active --quiet pcif-academie.service 2>/dev/null; then
  log "Arrêt de l'ancien service pcif-academie qui occupe le port 3000"
  systemctl disable --now pcif-academie.service
fi
log "Copie des nouvelles sources"
rsync -a --delete --exclude node_modules --exclude web/node_modules --exclude dist --exclude web/dist --exclude .git --exclude .env "$SOURCE_DIR/" "$APP/"
chown -R "$APP_USER:$APP_USER" "$APP"

log "Migrations et build"
cd "$APP"
if [[ -f package-lock.json ]]; then sudo -u "$APP_USER" npm ci; else sudo -u "$APP_USER" npm install; fi
sudo -u "$APP_USER" npm run db:init
sudo -u "$APP_USER" npm run db:reference
if [[ "$ENVIRONMENT" == "demo" ]]; then sudo -u "$APP_USER" npm run db:demo-sync; fi
sudo -u "$APP_USER" npm run db:reference-check
sudo -u "$APP_USER" npm run check
sudo -u "$APP_USER" npm run build
cd "$APP/web"
if [[ -f package-lock.json ]]; then sudo -u "$APP_USER" npm ci; else sudo -u "$APP_USER" npm install; fi
sudo -u "$APP_USER" env VITE_DEPLOYMENT_ENV="$ENVIRONMENT" npm run build

if [[ "$ENVIRONMENT" == "demo" ]]; then
  install -m 0750 -o root -g root "$APP/deploy/reset-demo.sh" /usr/local/sbin/pcif-academie-demo-reset
  cat >/etc/systemd/system/pcif-academie-demo-reset.service <<EOF
[Unit]
Description=Remise à zéro des données PCIF Académie Démo
After=postgresql.service
[Service]
Type=oneshot
Environment=PCIF_DEMO_APP_DIR=${APP}
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
systemctl daemon-reload
systemctl restart "$SERVICE"
for ((i=1; i<=30; i++)); do
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1 && API_OK=1 && break
  systemctl is-active --quiet "$SERVICE" || fail "Le service s'est arrêté."
  sleep 1
done
[[ "${API_OK:-0}" == 1 ]] || fail "L'API ne répond pas après 30 secondes."
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
}
remove_legacy_caddy_site
SITE_FILE="/etc/caddy/sites/pcif-academie-${ENVIRONMENT}.caddy"
ACME_EMAIL="$(awk '$1=="email" {print $2; exit}' "$SITE_FILE" 2>/dev/null || true)"
[[ "$ACME_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
  fail "Adresse ACME introuvable dans $SITE_FILE."
}
cat >"$SITE_FILE" <<EOF
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
    root * ${APP}/web/dist
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
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
if [[ "$ENVIRONMENT" == "demo" ]]; then
  systemctl enable --now pcif-academie-demo-reset.timer
fi
echo "Mise à jour ${ENVIRONMENT} terminée : $HEALTH_URL"
