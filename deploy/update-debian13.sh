#!/usr/bin/env bash
set -Eeuo pipefail

APP="/opt/pcif-academie"
SERVICE="pcif-academie"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_URL="http://127.0.0.1:3000/health"
MAX_WAIT=30

log(){ printf "\n==> %s\n" "$*"; }
fail(){
  echo
  echo "ERREUR: $*" >&2
  echo
  echo "--- systemctl status ${SERVICE} ---"
  systemctl status "$SERVICE" --no-pager -l || true
  echo
  echo "--- derniers logs ${SERVICE} ---"
  journalctl -u "$SERVICE" -n 80 --no-pager || true
  exit 1
}

[[ $EUID -eq 0 ]] || { echo "Lancer avec sudo/root."; exit 1; }
[[ -f "$APP/.env" ]] || { echo "Installation existante introuvable dans $APP."; exit 1; }

log "Arrêt des services applicatifs"
systemctl stop "$SERVICE" 2>/dev/null || true
if systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  systemctl stop caddy 2>/dev/null || true
fi

log "Vérification / démarrage PostgreSQL"
systemctl enable postgresql >/dev/null 2>&1 || true
systemctl restart postgresql
systemctl is-active --quiet postgresql || fail "PostgreSQL n'a pas redémarré."

log "Copie des nouvelles sources"
rsync -a --delete \
  --exclude node_modules \
  --exclude web/node_modules \
  --exclude dist \
  --exclude web/dist \
  --exclude .git \
  --exclude .env \
  "$SOURCE_DIR/" "$APP/"
chown -R pcif:pcif "$APP"

log "Dépendances serveur"
cd "$APP"
if [[ -f package-lock.json ]]; then
  if ! sudo -u pcif npm ci; then
    echo "package-lock.json désynchronisé : régénération avec npm install"
    sudo -u pcif npm install
  fi
else
  sudo -u pcif npm install
fi

log "Migrations et référentiel"
sudo -u pcif npm run db:init
sudo -u pcif npm run db:reference
sudo -u pcif npm run db:demo-sync
sudo -u pcif npm run db:reference-check

log "Contrôle TypeScript serveur"
sudo -u pcif npm run check

log "Build serveur"
sudo -u pcif npm run build

log "Dépendances et build Web"
cd "$APP/web"
if [[ -f package-lock.json ]]; then
  if ! sudo -u pcif npm ci; then
    echo "package-lock.json désynchronisé : régénération avec npm install"
    sudo -u pcif npm install
  fi
else
  sudo -u pcif npm install
fi
sudo -u pcif npm run build

log "Rechargement systemd"
systemctl daemon-reload

log "Redémarrage PCIF Académie"
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"

log "Attente de l'API"
API_OK=0
for ((i=1; i<=MAX_WAIT; i++)); do
  if curl -fsS "$HEALTH_URL" >/tmp/pcif-health.json 2>/dev/null; then
    API_OK=1
    break
  fi
  if ! systemctl is-active --quiet "$SERVICE"; then
    fail "Le service PCIF s'est arrêté pendant son démarrage."
  fi
  sleep 1
done

[[ "$API_OK" -eq 1 ]] || fail "L'API ne répond pas après ${MAX_WAIT} secondes."

echo "API opérationnelle :"
cat /tmp/pcif-health.json
echo

if systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  log "Validation et redémarrage Caddy"
  if [[ -f /etc/caddy/Caddyfile ]]; then
    caddy validate --config /etc/caddy/Caddyfile || fail "Configuration Caddy invalide."
  fi
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl restart caddy
  systemctl is-active --quiet caddy || fail "Caddy n'a pas redémarré."
else
  echo "Caddy non installé : étape ignorée."
fi

log "État final"
systemctl --no-pager --full status postgresql | sed -n '1,6p' || true
systemctl --no-pager --full status "$SERVICE" | sed -n '1,8p' || true
if systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  systemctl --no-pager --full status caddy | sed -n '1,8p' || true
fi

echo
echo "Mise à jour terminée avec succès."
echo "Health local : $HEALTH_URL"
