# PCIF Académie

PCIF Académie est un outil collaboratif de **pilotage du contrôle interne financier des EPLE**.

Il permet à l'établissement et à l'agence comptable de travailler sur un même PCIF, chacun selon son rôle, puis d'exploiter les réponses pour identifier les risques, suivre les actions et organiser le contrôle interne.

## Ce que contient l'application

PCIF Académie intègre aujourd'hui :

* le référentiel PCIF complet de **267 questions** ;
* le suivi des réponses Ordonnateur, Comptable et Synthèse ;
* la couverture et la maîtrise par domaine ;
* le radar de maîtrise et la cartographie des risques ;
* un programme annuel de maîtrise ;
* les ateliers PCIF ;
* le référentiel **FONCTIOP@LE V5.0** avec 181 opérations ;
* 39 procédures reliées aux contrôles PCIF ;
* la gestion des acteurs, délégations, suppléances et ruptures ;
* une administration des utilisateurs, EPLE et agences comptables.

## Une application multi-EPLE

Les droits sont définis par établissement.

Un utilisateur peut donc intervenir dans plusieurs EPLE avec des rôles différents :

* Chef d'établissement ;
* Secrétaire général d'EPLE ;
* Agent comptable ;
* Fondé de pouvoir ;
* Auditeur ;
* Administrateur.

L'agent comptable et le fondé de pouvoir peuvent disposer d'une vue transversale de leur agence. L'Auditeur est limité à la consultation.

## Du diagnostic au pilotage

Le PCIF n'est pas traité comme un simple questionnaire.

L'application permet de partir du diagnostic pour aller vers :

```text
Réponses
   ↓
Maîtrise
   ↓
Risques
   ↓
Priorités
   ↓
Plan d'action
```

Les données sont enregistrées dans PostgreSQL et restent liées à l'établissement et à la campagne concernés.

## Organisation fonctionnelle

PCIF Académie réunit trois approches complémentaires :

**PCIF**
Évaluer la maîtrise et identifier les risques.

**ONF / FONCTIOP@LE**
Identifier qui réalise quoi, avec quelles délégations, suppléances et ruptures.

**Processus**
Visualiser les procédures, leurs étapes et les contrôles PCIF associés.

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

L'application fonctionne directement dans un navigateur. EPLE Tools peut également l'utiliser comme client.

## Installation

Sur Debian 13 :

```bash
sudo apt update
sudo apt install -y postgresql nodejs npm
```

Puis :

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

## Référentiels

Les référentiels embarqués se trouvent dans :

```text
data/pcif-reference-267.json
data/fonctiopale-v5-181.json
data/pcif-processes-39.json
```

Ils regroupent respectivement les 267 contrôles PCIF, les 181 opérations FONCTIOP@LE et les 39 procédures utilisées pour la cartographie des processus.

## État du projet

PCIF Académie est encore en développement.

Le socle fonctionnel est désormais en place : référentiel, campagnes, multi-EPLE, rôles, risques, ONF, processus et administration.

La priorité est maintenant de fiabiliser l'usage réel, les restitutions et le déploiement plutôt que d'ajouter des fonctions pour elles-mêmes.
