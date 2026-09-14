#!/usr/bin/env bash
set -Eeuo pipefail
APP_USER=pcif
APP_DIR=/opt/pcif-academie
DB_NAME=pcif_academie
DB_USER=pcif_app
DOMAIN=""
DEMO=yes
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
trap 'echo "Erreur ligne $LINENO"; exit 1' ERR
[[ $EUID -eq 0 ]] || { echo "Lancer avec sudo/root."; exit 1; }
while [[ $# -gt 0 ]]; do
 case "$1" in
  --domain) DOMAIN="$2"; shift 2;;
  --no-demo) DEMO=no; shift;;
  *) echo "Option inconnue: $1"; exit 1;;
 esac
done
. /etc/os-release
[[ "$ID" == debian ]] || { echo "Debian requis."; exit 1; }

echo "==> Paquets système"
apt-get update
apt-get install -y ca-certificates curl gnupg postgresql postgresql-client openssl rsync

if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)" -lt 20 ]]; then
 echo "==> Node.js 22 LTS"
 install -d -m 0755 /etc/apt/keyrings
 curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
 echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
 apt-get update && apt-get install -y nodejs
fi

echo "==> Compte système et fichiers"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
rsync -a --delete --exclude node_modules --exclude web/node_modules --exclude dist --exclude web/dist --exclude .git --exclude .env "$SOURCE_DIR/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> PostgreSQL"
systemctl enable --now postgresql
DB_PASSWORD="$(openssl rand -hex 24)"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$DB_USER') THEN
   CREATE ROLE $DB_USER LOGIN;
 END IF;
END \$\$;
ALTER ROLE $DB_USER PASSWORD '$DB_PASSWORD';
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

JWT_SECRET="$(openssl rand -hex 48)"
ORIGIN="http://127.0.0.1"
[[ -n "$DOMAIN" ]] && ORIGIN="https://$DOMAIN"
cat >"$APP_DIR/.env" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=${ORIGIN}
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"; chmod 600 "$APP_DIR/.env"

echo "==> Dépendances et base"
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then sudo -u "$APP_USER" npm ci; else sudo -u "$APP_USER" npm install; fi
sudo -u "$APP_USER" npm audit --audit-level=critical || echo "ATTENTION: audit serveur à corriger avant exposition."
sudo -u "$APP_USER" npm run db:init
[[ "$DEMO" == yes ]] && sudo -u "$APP_USER" npm run db:seed
sudo -u "$APP_USER" npm run check
sudo -u "$APP_USER" npm run build

echo "==> Interface Web"
cd "$APP_DIR/web"
if [[ -f package-lock.json ]]; then sudo -u "$APP_USER" npm ci; else sudo -u "$APP_USER" npm install; fi
sudo -u "$APP_USER" npm audit --audit-level=critical || echo "ATTENTION: audit Web à corriger."
sudo -u "$APP_USER" npm run build

echo "==> systemd"
cat >/etc/systemd/system/pcif-academie.service <<EOF
[Unit]
Description=PCIF Académie
After=network.target postgresql.service
Requires=postgresql.service
[Service]
Type=simple
User=pcif
Group=pcif
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/dist/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR
UMask=0077
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now pcif-academie
sleep 2
curl -fsS http://127.0.0.1:3000/health >/dev/null || { journalctl -u pcif-academie -n 50 --no-pager; exit 1; }

if [[ -n "$DOMAIN" ]]; then
 echo "==> Caddy + HTTPS"
 apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
 curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
 curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt >/etc/apt/sources.list.d/caddy-stable.list
 apt-get update && apt-get install -y caddy
 cat >/etc/caddy/Caddyfile <<EOF
$DOMAIN {
 encode zstd gzip
 @api path /api/* /health
 reverse_proxy @api 127.0.0.1:3000
 root * $APP_DIR/web/dist
 try_files {path} /index.html
 file_server
}
EOF
 caddy validate --config /etc/caddy/Caddyfile
 systemctl enable --now caddy
 systemctl reload caddy
fi
echo "Installation terminée."
echo "Health: curl http://127.0.0.1:3000/health"
[[ -n "$DOMAIN" ]] && echo "Web: https://$DOMAIN"
