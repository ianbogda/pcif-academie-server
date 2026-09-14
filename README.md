# PCIF Académie

PCIF Académie est un outil collaboratif dédié au **contrôle interne financier des EPLE**.

L'idée est simple : permettre à l'établissement et à l'agence comptable de travailler sur le même PCIF, chacun dans son rôle, puis d'utiliser les réponses pour piloter les risques et les actions à mener.

## Ce que fait l'application

PCIF Académie permet aujourd'hui de :

* travailler avec le référentiel complet de **267 questions** ;
* distinguer les contributions **Ordonnateur**, **Comptable** et **Synthèse** ;
* gérer plusieurs établissements et plusieurs agences comptables ;
* attribuer des rôles par établissement ;
* donner à l'agent comptable et au fondé de pouvoir une vision transversale ;
* donner à un auditeur un accès en lecture seule ;
* suivre la couverture et le niveau de maîtrise du PCIF ;
* visualiser les risques et les domaines à renforcer ;
* construire un programme annuel de maîtrise ;
* organiser les ateliers PCIF.

Les données sont enregistrées dans PostgreSQL et rattachées à l'établissement et à la campagne concernée.

## Du questionnaire au pilotage

Le questionnaire n'est qu'un point de départ.

À partir des réponses, PCIF Académie permet de faire ressortir :

* la couverture du référentiel ;
* la maîtrise par domaine ;
* les points clés ;
* les risques résiduels ;
* les priorités d'action.

L'application propose notamment un radar de maîtrise, une matrice Gravité × Occurrence et une cartographie des risques.

## Les rôles

Les droits sont définis par établissement.

Un utilisateur peut donc intervenir dans plusieurs EPLE avec des rôles différents.

Les principaux profils sont :

* Chef d'établissement ;
* Secrétaire général d'EPLE ;
* Agent comptable ;
* Fondé de pouvoir ;
* Auditeur ;
* Administrateur.

L'Auditeur peut consulter l'ensemble du PCIF des établissements auxquels il est rattaché, mais ne peut rien modifier.

## Architecture

```text
Navigateur / EPLE Tools
          │
        HTTPS
          │
        Caddy
          │
     API Fastify
          │
      PostgreSQL
```

L'application est indépendante d'Electron : EPLE Tools peut l'utiliser comme client, mais PCIF Académie fonctionne également directement dans un navigateur.

## Installation Debian 13

```bash
sudo apt update
sudo apt install -y postgresql nodejs npm
```

Créer la base PostgreSQL, puis :

```bash
cp .env.example .env
npm install
npm run db:init
npm run db:reference
npm run db:seed
```

Lancer l'API :

```bash
npm run dev:api
```

Puis l'interface :

```bash
cd web
npm install
npm run dev
```

## Déploiement

Installation :

```bash
chmod +x deploy/install-debian13.sh
sudo ./deploy/install-debian13.sh --domain pcif.example.fr
```

Mise à jour :

```bash
sudo ./deploy/update-debian13.sh
```

Le script de mise à jour redémarre PostgreSQL, PCIF Académie et Caddy et vérifie ensuite que `/health` répond correctement.

## Référentiel PCIF

Le référentiel embarqué contient **267 questions** et se trouve dans :

```text
data/pcif-reference-267.json
```

L'import est versionné et peut être relancé sans créer de doublons :

```bash
npm run db:reference
```

Les domaines, catégories, sphères, poids, points clés et risques associés sont conservés.

## État du projet

PCIF Académie est encore en développement.

Le socle multi-utilisateur et multi-établissement fonctionne désormais avec le référentiel métier et les principaux outils de pilotage.

La suite consiste surtout à fiabiliser l'exploitation en production et à enrichir progressivement les restitutions et le suivi des plans d'action.
