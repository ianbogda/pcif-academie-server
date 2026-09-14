# PCIF Académie — v0.3.0 — serveur + interface Web collaborative

Première itération exécutable du serveur collaboratif multi-EPLE.

## Périmètre livré

- PostgreSQL ;
- authentification JWT ;
- utilisateurs ;
- établissements ;
- agences comptables et rattachements ;
- rôles par établissement ;
- accès transversal AC ;
- campagnes PCIF ;
- référentiel/version de questions ;
- réponses séparées `ORDONNATEUR`, `COMPTABLE`, `SYNTHESE` ;
- verrouillage optimiste par numéro de version ;
- journal d'audit append-only ;
- tableau de bord agence ;
- API utilisable depuis navigateur ou EPLE Tools Electron ;
- amorce de Row Level Security PostgreSQL.

Cette v0.1.0 n'est **pas** encore une production Internet complète : OIDC/SSO, MFA,
rate limiting, rotation des refresh tokens, sauvegardes, supervision et import du
référentiel PCIF réel doivent être ajoutés avant ouverture publique.

## Architecture

Client Web / Electron
        |
      HTTPS
        |
      Caddy
        |
   API Fastify/TS
        |
   PostgreSQL

Le serveur est volontairement indépendant d'Electron : Electron est un client API.

## Installation Debian 13

```bash
sudo apt update
sudo apt install -y postgresql nodejs npm
sudo -u postgres psql
```

Puis créer la base et le compte applicatif :

```sql
CREATE ROLE pcif_app LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE pcif_academie OWNER pcif_app;
```

```bash
cp .env.example .env
npm install
npm run db:init
npm run db:seed
npm run dev
```

Le seed crée désormais une agence comptable de démonstration avec 8 EPLE et cinq profils :

| Profil | Identifiant | Mot de passe | Périmètre |
|---|---|---|---|
| Administrateur | `admin@example.test` | `ChangeMe-ADMIN-2026!` | établissement support dans cette itération |
| Agent comptable | `ac@example.test` | `ChangeMe-AC-2026!` | les 8 EPLE de l’agence |
| Fondé de pouvoir | `fp@example.test` | `ChangeMe-FP-2026!` | les 8 EPLE de l’agence |
| Chef d’établissement | `ce@example.test` | `ChangeMe-CE-2026!` | uniquement le collège Pierre Brossolette Démo |
| SGE | `sge@example.test` | `ChangeMe-SGE-2026!` | uniquement le collège Pierre Brossolette Démo |

Une campagne PCIF ouverte est créée pour chacun des 8 établissements.

**Changer/supprimer ces comptes avant toute mise en production.**

## Routes principales

- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/establishments`
- `GET /api/agencies`
- `GET /api/agencies/:id/dashboard`
- `GET /api/campaigns?establishmentId=...`
- `POST /api/campaigns`
- `GET /api/campaigns/:id/questions`
- `PUT /api/campaigns/:campaignId/answers/:questionId`

Exemple de réponse :

```json
{
  "value": 2,
  "comment": "Procédure formalisée",
  "sphere": "COMPTABLE",
  "version": 1
}
```

Pour modifier une réponse existante, envoyer sa version courante. En cas de modification
concurrente, l'API répond `409 CONFLICT`.

## Référentiel PCIF

Le seed ne fabrique pas les 267 questions métier : il crée seulement trois questions
de démonstration. Le vrai référentiel doit être importé depuis la source PCIF Académie
existante, afin de ne pas altérer les libellés, poids, étoiles, badges et sphères.

Le modèle `repository_versions/questions` est déjà prévu pour accueillir ce référentiel.


## Scénarios de test recommandés

1. Se connecter en `CE` : `/api/establishments` ne doit renvoyer qu’un seul EPLE.
2. Se connecter en `SGE` : même cloisonnement qu’au CE.
3. Se connecter en `AC` : les 8 EPLE doivent être visibles.
4. Se connecter en `FP` : les 8 EPLE doivent être visibles.
5. Vérifier que CE et SGE ne peuvent pas appeler les campagnes d’un autre EPLE.
6. Tester une modification concurrente d’une même réponse pour provoquer un `409 CONFLICT`.

### Point restant volontairement ouvert

Le rôle `PLATFORM_ADMIN` existe et le compte de démo est créé. En revanche, la v0.2 ne donne pas
encore automatiquement un accès global à tous les EPLE à partir de ce seul rôle. C’est volontaire :
l’accès administrateur global doit être implémenté explicitement dans le moteur d’autorisation, pas
par un contournement implicite des règles multi-tenant.


## Interface Web v0.3

Cette itération ajoute une SPA React/Vite dans `web/`.

Fonctionnalités :
- page de connexion ;
- sélection rapide des comptes de démonstration ;
- tableau de bord agence pour AC/FP ;
- cloisonnement CE/SGE ;
- navigation établissement → campagne ;
- questionnaire ;
- filtres domaine/sphère et recherche ;
- contribution ordonnateur/comptable/synthèse ;
- sauvegarde via API ;
- détection des conflits de version ;
- responsive desktop/tablette/mobile.

Lancer en développement :

```bash
npm install
npm run db:init
npm run db:seed
npm run dev:api
```

Dans un second terminal :

```bash
cd web
npm install
npm run dev
```

Ouvrir `http://localhost:5173`.

Voir `docs/WEB-V0.3.md`.

- contrôle d’écriture par sphère appliqué côté API (ordonnateur/comptable/synthèse).

## v0.4 — auto-installateur Debian 13

```bash
chmod +x deploy/install-debian13.sh
sudo ./deploy/install-debian13.sh --domain pcif.example.fr
```

Sans domaine :

```bash
sudo ./deploy/install-debian13.sh
```

Mise à jour :

```bash
sudo ./deploy/update-debian13.sh
```

Cette version intègre également `"type": "module"`, `@fastify/jwt` 10.2.2 et le démarrage de production via `dist/src/server.js`.


## Correctif v0.4.1

Correction de la signature `AnswerEditor` : la prop `editable` est désormais correctement déstructurée, ce qui rétablit la compilation TypeScript du frontend.
