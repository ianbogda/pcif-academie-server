# EPLE Tools Integration Contract v1

Identifiant pivot : **UAI**. Les applications restent propriétaires de leurs données.

## Signal
`id`, `source`, `uai`, `domain`, `processCode`, `type` (`INFO|WARNING|ALERT`), `severity` (1..3),
`title`, `description`, `observedAt`, `evidence`, `rule`.

Un signal est une observation. Il ne modifie jamais automatiquement un score PCIF et n'est pas un risque PCIF.

## Sécurité
HTTPS + Bearer serveur-à-serveur. Secrets uniquement côté serveur. Synchronisation idempotente.
