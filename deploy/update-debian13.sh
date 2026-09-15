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
if [[ "$ENVIRONMENT" == "prod" ]]; then PORT=3000; else PORT=3001; fi
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
systemctl stop "$SERVICE" 2>/dev/null || true
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
fi
systemctl daemon-reload
systemctl restart "$SERVICE"
for ((i=1; i<=30; i++)); do
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1 && API_OK=1 && break
  systemctl is-active --quiet "$SERVICE" || fail "Le service s'est arrêté."
  sleep 1
done
[[ "${API_OK:-0}" == 1 ]] || fail "L'API ne répond pas après 30 secondes."
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
echo "Mise à jour ${ENVIRONMENT} terminée : $HEALTH_URL"
