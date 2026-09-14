#!/usr/bin/env bash
set -Eeuo pipefail
trap 'systemctl start pcif-academie >/dev/null 2>&1 || true' EXIT
[[ $EUID -eq 0 ]] || { echo "Lancer avec sudo/root."; exit 1; }
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP=/opt/pcif-academie
systemctl stop pcif-academie
rsync -a --delete --exclude node_modules --exclude web/node_modules --exclude dist --exclude web/dist --exclude .git --exclude .env "$SRC/" "$APP/"
chown -R pcif:pcif "$APP"
cd "$APP"
sudo -u pcif npm ci
sudo -u pcif npm run db:init
sudo -u pcif npm run db:reference
sudo -u pcif npm run check
sudo -u pcif npm run build
cd web
sudo -u pcif npm ci
sudo -u pcif npm run build
systemctl start pcif-academie
sleep 2
curl -fsS http://127.0.0.1:3000/health
echo
echo "Mise à jour terminée."
