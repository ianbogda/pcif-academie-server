# PCIF Académie 0.36.0 — EPLE Tools Contract v1

- API serveur-à-serveur `POST /api/integrations/vigie/summaries`.
- Clients applicatifs hachés et scopes `vigie:summary:read`.
- Synchronisation des signaux Vigie par UAI.
- Signal externe distinct du risque et du score PCIF.
- Stockage idempotent et journal des synchronisations.
- Consultation et acquittement des signaux avec RBAC PCIF.

## Intégration
Ajouter `registerIntegrations(app)` dans `src/server.ts`, puis configurer :
`VIGIE_BASE_URL`, `VIGIE_API_KEY`, `VIGIE_TIMEOUT_MS`.

Pour créer la clé Vigie en base, stocker `sha256(CLE_EN_CLAIR)` dans `integration_clients.key_hash`.
