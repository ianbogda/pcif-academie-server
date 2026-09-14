# PCIF Académie

PCIF Académie est un outil collaboratif de **contrôle interne financier pour les EPLE**.

Il permet à un établissement, à son agence comptable et aux personnes chargées du pilotage ou de l'audit de travailler sur un même référentiel PCIF, tout en conservant des droits et des contributions distincts selon les rôles.

L'application est pensée pour un fonctionnement **multi-utilisateur, multi-établissement et multi-agence comptable**.

La version actuelle intègre le référentiel PCIF Académie complet de **267 questions** et s'oriente vers une logique d'**observatoire du contrôle interne financier** : moins un simple questionnaire, davantage un outil de lecture, de suivi et de pilotage des risques.

> **Version actuelle : 0.6.x**
>
> Le projet reste en développement. Il peut être installé et testé sur un serveur dédié, mais plusieurs briques de sécurité et d'exploitation restent à consolider avant une ouverture publique large.

---

## À quoi sert PCIF Académie ?

Le principe est de permettre à plusieurs acteurs de travailler sur un même dispositif de contrôle interne sans mélanger leurs responsabilités.

L'application permet notamment de :

* gérer plusieurs établissements ;
* regrouper les EPLE au sein d'agences comptables ;
* gérer les utilisateurs et leurs rattachements ;
* définir un rôle pour chaque utilisateur et chaque établissement ;
* créer et suivre des campagnes PCIF ;
* parcourir les 267 questions du référentiel ;
* distinguer les contributions Ordonnateur, Comptable et Synthèse ;
* permettre à une agence comptable de suivre plusieurs EPLE ;
* donner un accès en lecture seule à un auditeur ;
* conserver l'historique des opérations ;
* éviter l'écrasement silencieux de réponses lors d'un travail simultané ;
* exploiter progressivement les données à l'échelle d'un établissement, d'une agence ou d'un ensemble d'EPLE.

---

# Le référentiel PCIF

PCIF Académie embarque désormais le référentiel métier complet de **267 questions**.

Il est stocké dans :

```text
data/pcif-reference-267.json
```

L'import conserve les informations associées aux questions :

* domaine ;
* catégorie ;
* sphère ;
* poids ;
* point-clé / badge ;
* risque associé.

Le référentiel est versionné afin qu'une évolution future ne modifie pas rétroactivement le contenu des campagnes déjà ouvertes.

L'import peut être relancé sans créer de doublons :

```bash
npm run db:reference
```

Cette commande est conçue pour être **idempotente** : relancer l'import avec la même version du référentiel ne doit pas multiplier les questions existantes.

---

# Trois sphères de contribution

Les réponses sont distinguées selon trois sphères :

```text
ORDONNATEUR
COMPTABLE
SYNTHESE
```

Cette séparation est structurante.

Elle permet de conserver les constats propres à l'ordonnateur et au comptable avant, lorsque cela est nécessaire, de construire une lecture commune dans la synthèse.

Les droits d'écriture associés à ces sphères sont contrôlés côté serveur.

Ils ne reposent donc pas uniquement sur ce qui est affiché ou masqué dans l'interface.

---

# Les rôles

Un utilisateur peut être rattaché à plusieurs établissements.

Son rôle est défini pour chacun de ces rattachements.

## Chef d'établissement

Le chef d'établissement intervient dans le périmètre relevant de l'ordonnateur.

## Secrétaire général d'EPLE

Le SGE intervient également sur la sphère Ordonnateur des établissements auxquels il est rattaché.

## Agent comptable

L'agent comptable dispose d'une vision transversale des établissements de son agence comptable.

Il intervient notamment sur la sphère Comptable.

## Fondé de pouvoir

Le fondé de pouvoir dispose également d'un accès transversal aux établissements de l'agence selon les droits qui lui sont attribués.

## Auditeur

Le rôle **Auditeur** est volontairement limité à la consultation.

Un auditeur peut accéder aux campagnes des établissements auxquels il est rattaché et consulter :

* les réponses Ordonnateur ;
* les réponses Comptable ;
* les Synthèses.

Il ne peut modifier aucune réponse.

Ce rôle est adapté aux besoins de contrôle, d'audit, d'accompagnement ou de revue d'un dispositif sans intervenir sur son contenu.

## Administrateur de la plateforme

L'administrateur gère l'instance elle-même.

Il peut notamment :

* créer les utilisateurs ;
* modifier leurs informations ;
* gérer les rattachements aux établissements ;
* attribuer les rôles ;
* suspendre ou réactiver un compte ;
* effectuer une suppression logique.

Une adresse électronique valide est contrôlée côté API.

---

# Une logique d'observatoire

La v0.6 marque une évolution du projet.

PCIF Académie n'est plus uniquement pensé comme un questionnaire permettant de renseigner des réponses.

L'objectif est d'en faire progressivement un **observatoire du contrôle interne financier**.

L'interface adopte donc une logique de cockpit permettant de faire ressortir :

* les établissements ;
* les campagnes ;
* les domaines du PCIF ;
* les sphères Ordonnateur et Comptable ;
* les niveaux de maîtrise ;
* les risques ;
* les points-clés ;
* les écarts et les zones nécessitant une attention particulière.

La logique multi-établissement doit à terme permettre plusieurs niveaux de lecture :

```text
Question
   ↓
Domaine
   ↓
Établissement
   ↓
Agence comptable
   ↓
Vue consolidée
```

L'objectif n'est pas de produire artificiellement un classement entre établissements, mais de permettre une lecture structurée des risques et des besoins d'accompagnement.

---

# Interface

L'interface Web se trouve dans :

```text
web/
```

Elle est développée avec React, TypeScript et Vite.

La direction graphique actuelle privilégie une représentation de type **observatoire / cockpit**, sombre et orientée pilotage.

Elle permet notamment :

* la connexion ;
* le choix de l'établissement actif ;
* la navigation entre établissements et campagnes ;
* l'accès au questionnaire PCIF ;
* la recherche dans le référentiel ;
* le filtrage par domaine ;
* le filtrage par sphère ;
* l'accès aux différentes contributions ;
* la consultation transversale pour l'agence comptable ;
* l'administration des utilisateurs.

L'application reste prévue pour être utilisable depuis un navigateur sur ordinateur, tablette ou smartphone.

---

# Architecture

L'application repose sur une architecture client/serveur :

```text
Navigateur / EPLE Tools
          │
        HTTPS
          │
        Caddy
          │
   API Fastify / TS
          │
     PostgreSQL
```

L'interface utilisateur ne dialogue jamais directement avec PostgreSQL.

L'API porte les règles métier, les contrôles d'accès et les opérations sur les données.

Electron, lorsqu'il est utilisé depuis EPLE Tools, reste donc uniquement un client de cette API.

Cette séparation permet d'utiliser la même instance depuis plusieurs postes sans dépendre d'une installation locale particulière.

---

# Travail simultané

Plusieurs utilisateurs peuvent intervenir sur une même campagne.

Pour éviter qu'une modification écrase silencieusement celle d'une autre personne, chaque réponse dispose d'un numéro de version.

Exemple :

```json
{
  "value": 2,
  "comment": "Procédure formalisée",
  "sphere": "COMPTABLE",
  "version": 1
}
```

Lors d'une modification, le client transmet la version qu'il connaît.

Si quelqu'un a modifié la réponse entre-temps, l'API peut répondre :

```text
409 CONFLICT
```

L'utilisateur doit alors prendre connaissance de la nouvelle version avant de poursuivre.

---

# Journalisation

Les opérations importantes peuvent être enregistrées dans un journal d'audit append-only.

Le principe est qu'un événement déjà enregistré dans ce journal n'a pas vocation à être modifié a posteriori.

Cette journalisation doit permettre progressivement de répondre à des questions simples :

* qui a modifié une information ?
* quand ?
* sur quel établissement ?
* dans quelle campagne ?
* sur quelle question ?

---

# Installation pour le développement

## Prérequis

L'environnement de référence est actuellement Debian 13.

```bash
sudo apt update
sudo apt install -y postgresql nodejs npm
```

Créer ensuite la base :

```bash
sudo -u postgres psql
```

Puis :

```sql
CREATE ROLE pcif_app LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE pcif_academie OWNER pcif_app;
```

Configurer l'application :

```bash
cp .env.example .env
npm install
```

Initialiser la base :

```bash
npm run db:init
```

Importer le référentiel PCIF :

```bash
npm run db:reference
```

Créer éventuellement les données de démonstration :

```bash
npm run db:seed
```

Lancer l'API :

```bash
npm run dev:api
```

Dans un second terminal :

```bash
cd web
npm install
npm run dev
```

L'interface de développement est alors disponible sur :

```text
http://localhost:5173
```

---

# Créer le premier administrateur

Un administrateur réel peut être créé en ligne de commande :

```bash
npm run admin:create -- \
  --email admin@domaine.fr \
  --name "Administrateur" \
  --password "MotDePasseSolide!"
```

Ce mécanisme évite de dépendre d'un compte administrateur de démonstration pour initialiser une installation réelle.

---

# Données de démonstration

Le seed peut créer une agence comptable fictive composée de plusieurs EPLE afin de tester les différents comportements de l'application.

Les profils de démonstration couvrent notamment :

| Profil               | Accès                                           |
| -------------------- | ----------------------------------------------- |
| Agent comptable      | établissements de l'agence                      |
| Fondé de pouvoir     | établissements de l'agence                      |
| Chef d'établissement | établissement de rattachement                   |
| SGE                  | établissement de rattachement                   |
| Auditeur             | établissement(s) de rattachement, lecture seule |

Les comptes de démonstration ne doivent pas être conservés sur une installation de production.

---

# Déploiement Debian

Un script permet d'installer l'application sur Debian 13.

Avec un nom de domaine :

```bash
chmod +x deploy/install-debian13.sh
sudo ./deploy/install-debian13.sh --domain pcif.example.fr
```

Sans domaine :

```bash
sudo ./deploy/install-debian13.sh
```

Pour mettre à jour une installation :

```bash
sudo ./deploy/update-debian13.sh
```

Le serveur de production démarre depuis :

```text
dist/src/server.js
```

---

# API

Quelques routes principales :

```text
POST /api/auth/login

GET  /api/me
GET  /api/establishments

GET  /api/agencies
GET  /api/agencies/:id/dashboard

GET  /api/campaigns?establishmentId=...
POST /api/campaigns

GET  /api/campaigns/:id/questions

PUT  /api/campaigns/:campaignId/answers/:questionId
```

Les droits doivent toujours être contrôlés par l'API.

Le fait qu'une action ne soit pas proposée dans l'interface ne constitue pas une mesure de sécurité.

---

# Sécurité

Plusieurs briques sont déjà en place :

* authentification JWT ;
* contrôle des autorisations côté API ;
* rôles par établissement ;
* accès transversal encadré pour l'agence comptable ;
* rôle Auditeur en lecture seule ;
* verrouillage optimiste ;
* journal d'audit ;
* amorce de Row Level Security PostgreSQL.

Ce socle reste à compléter avant une exposition large sur Internet.

Les sujets restant notamment à consolider sont :

* SSO ou authentification institutionnelle ;
* MFA si le contexte l'impose ;
* gestion et rotation des refresh tokens ;
* expiration des sessions ;
* rate limiting ;
* sauvegardes automatiques ;
* tests de restauration ;
* supervision ;
* gestion des secrets ;
* durcissement du reverse proxy ;
* politique de conservation des journaux.

---

# Tests de cloisonnement

Après une installation ou une évolution du moteur d'autorisation, plusieurs contrôles doivent être systématiques :

1. un chef d'établissement ne voit que ses établissements ;
2. un SGE respecte le même cloisonnement ;
3. un agent comptable voit les établissements de son agence ;
4. un fondé de pouvoir dispose uniquement du périmètre prévu ;
5. un auditeur peut consulter son périmètre mais ne peut rien modifier ;
6. un utilisateur ne peut pas accéder directement par l'API à un établissement hors de son périmètre ;
7. les droits d'écriture par sphère sont contrôlés côté serveur ;
8. deux modifications concurrentes produisent bien le comportement prévu.

---

# Documentation

La documentation complémentaire se trouve dans :

```text
docs/
```

Les documents techniques ou propres à une version peuvent y être conservés sans alourdir ce README.

---

# État du projet

PCIF Académie est encore en développement, mais son architecture principale commence à se stabiliser.

Le socle actuel repose sur cinq éléments :

**un référentiel métier commun, un fonctionnement multi-EPLE, des rôles explicites, des contributions séparées et une exploitation collective des données.**

Les prochaines évolutions doivent surtout renforcer la capacité à transformer les réponses au PCIF en informations utiles pour le pilotage : cartographie des risques, suivi dans le temps, plans d'action, comparaisons de campagnes et vues consolidées.

Le questionnaire reste le point d'entrée.

Il ne doit pas devenir la finalité de l'outil.
