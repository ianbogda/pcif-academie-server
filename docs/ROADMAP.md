# Roadmap proposée

## v0.2 — rendre PCIF réellement exploitable
- import exact des 267 questions PCIF Académie ;
- domaines, sous-domaines, poids, étoiles, badges ;
- création/gestion des 8 établissements réels ;
- interface d'administration utilisateurs/rôles ;
- campagne annuelle ;
- états OPEN/REVIEW/VALIDATED ;
- synthèse ordonnateur/comptable ;
- dashboard AC enrichi.

## v0.3 — production
- OIDC/SSO ;
- MFA via fournisseur d'identité ;
- refresh/session sécurisée ;
- rate limiting ;
- RLS forcée avec rôle DB runtime non propriétaire ;
- tests unitaires/intégration ;
- sauvegardes PostgreSQL hors serveur ;
- supervision et alertes ;
- journal d'audit consultable.

## v0.4 — intégration EPLE Tools
- SDK TypeScript `@eple-tools/api-client` ;
- module Electron `runtime: remote` ;
- établissement actif partagé ;
- authentification commune ;
- notifications.
