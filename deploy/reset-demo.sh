#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="${PCIF_DEMO_APP_DIR:-/opt/pcif-academie-demo}"
SERVICE="${PCIF_DEMO_SERVICE:-pcif-academie-demo}"
ENV_FILE="$APP_DIR/.env"
[[ $EUID -eq 0 ]] || { echo "Le RAZ doit être exécuté par root." >&2; exit 1; }
[[ -r "$ENV_FILE" ]] || { echo "Configuration démo absente : $ENV_FILE" >&2; exit 1; }
set -a
. "$ENV_FILE"
set +a
[[ "${DEPLOYMENT_ENV:-}" == "demo" ]] || { echo "RAZ refusé : environnement différent de demo." >&2; exit 1; }
DB_FROM_URL="${DATABASE_URL##*/}"
DB_FROM_URL="${DB_FROM_URL%%\?*}"
[[ "$DB_FROM_URL" == "pcif_academie_demo" ]] || { echo "RAZ refusé : base non autorisée ($DB_FROM_URL)." >&2; exit 1; }
[[ "$APP_DIR" == "/opt/pcif-academie-demo" ]] || { echo "RAZ refusé : répertoire non autorisé." >&2; exit 1; }
[[ "$SERVICE" == "pcif-academie-demo" ]] || { echo "RAZ refusé : service non autorisé." >&2; exit 1; }
restart_demo() { systemctl start "$SERVICE" || true; }
trap restart_demo EXIT
systemctl stop "$SERVICE"
cd "$APP_DIR"
sudo -u pcif-demo psql -v ON_ERROR_STOP=1 "$DATABASE_URL" <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
SQL
sudo -u pcif-demo npm run db:init
sudo -u pcif-demo npm run db:reference
sudo -u pcif-demo npm run db:seed
sudo -u pcif-demo npm run db:demo-sync
sudo -u pcif-demo npm run db:reference-check
systemctl start "$SERVICE"
curl -fsS "http://127.0.0.1:${PORT:-3001}/health" >/dev/null
trap - EXIT
echo "Données de démonstration remises à zéro."
