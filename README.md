# PCIF Académie

PCIF Académie est un outil de travail collaboratif autour du **plan de contrôle interne financier (PCIF) des EPLE**.

L'objectif est de permettre à un établissement et à son agence comptable de travailler sur un même PCIF tout en conservant clairement les contributions de chacun.

Le projet existait initialement sous la forme d'une application autonome. Il évolue aujourd'hui vers une application Web multi-utilisateur et multi-établissement, utilisable depuis un navigateur ou depuis EPLE Tools.

> **Version actuelle : 0.5.1**
> Le projet est encore en développement. Cette version permet de tester l'architecture et les principaux usages, mais n'est pas encore destinée à une ouverture publique en production.

---

## Ce que permet l'application

PCIF Académie permet aujourd'hui de :

* gérer plusieurs EPLE au sein d'une même instance ;
* regrouper les établissements par agence comptable ;
* créer et administrer les utilisateurs ;
* rattacher un utilisateur à un ou plusieurs établissements ;
* lui attribuer un rôle différent selon l'établissement ;
* créer et suivre les campagnes PCIF ;
* distinguer les contributions de l'ordonnateur, du comptable et la synthèse ;
* donner à l'agence comptable une vision transversale de ses établissements ;
* permettre à un auditeur de consulter un PCIF sans pouvoir le modifier ;
* conserver un journal des opérations ;
* détecter les modifications concurrentes d'une même réponse.

L'application reprend progressivement l'identité visuelle de la version historique de PCIF Académie.

---

## Les rôles

Les droits ne sont pas simplement attachés à un utilisateur : ils dépendent également de l'établissement sur lequel il travaille.

Un même utilisateur peut donc intervenir dans plusieurs EPLE avec des rôles différents.

### Chef d'établissement

Le chef d'établissement travaille sur la partie relevant de la sphère **Ordonnateur** de son établissement.

### Secrétaire général d'EPLE

Le SGE intervient également dans le périmètre **Ordonnateur** des établissements auxquels il est rattaché.

### Agent comptable

L'agent comptable dispose d'une vision transversale des établissements de son agence comptable et intervient sur la sphère **Comptable**.

### Fondé de pouvoir

Le fondé de pouvoir bénéficie du même principe d'accès transversal aux établissements de l'agence.

### Auditeur

L'auditeur dispose volontairement d'un accès en **lecture seule**.

Il peut consulter, pour les établissements auxquels il est rattaché :

* les campagnes ;
* les questions ;
* les réponses Ordonnateur ;
* les réponses Comptable ;
* les Synthèses.

Il ne peut modifier aucune réponse.

Ce rôle peut notamment servir pour une mission d'audit, une revue du dispositif de contrôle interne ou un accompagnement nécessitant l'accès au PCIF sans intervention sur son contenu.

### Administrateur de la plateforme

L'administrateur gère le fonctionnement de l'instance et notamment les utilisateurs et leurs rattachements.

L'administration permet de :

* créer un utilisateur ;
* modifier son compte ;
* suspendre ou réactiver son accès ;
* effectuer une suppression logique ;
* gérer ses établissements ;
* définir son rôle pour chacun d'eux.

Une adresse électronique valide est obligatoire et un utilisateur métier doit être rattaché à au moins un établissement.

---

## Organisation des contributions

Une réponse PCIF appartient à l'une des trois sphères :

```text
ORDONNATEUR
COMPTABLE
SYNTHESE
```

Cette séparation permet de conserver les contributions des différents acteurs avant d'aboutir, lorsque cela est nécessaire, à une synthèse partagée.

Les droits d'écriture sont contrôlés par l'API et pas uniquement par l'interface utilisateur.

---

## Travail à plusieurs

PCIF Académie est conçu pour permettre à plusieurs personnes de travailler sur une même campagne.

Chaque réponse possède un numéro de version.

Lors d'une modification, le client transmet la version qu'il connaît :

```json
{
  "value": 2,
  "comment": "Procédure formalisée",
  "sphere": "COMPTABLE",
  "version": 1
}
```

Si la réponse a été modifiée entre-temps par un autre utilisateur, l'API refuse l'écrasement avec :

```text
409 CONFLICT
```

L'objectif est simple : ne pas perdre silencieusement le travail de quelqu'un lorsqu'une campagne est renseignée à plusieurs.

---

## Architecture

L'application repose sur une architecture client/serveur classique :

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

Le serveur est indépendant d'Electron.

EPLE Tools peut donc utiliser PCIF Académie comme client de l'API, mais l'application reste également utilisable directement depuis un navigateur.

Cette séparation est volontaire : les données, les droits et les règles métier doivent rester contrôlés côté serveur.

---

## Interface Web

L'interface se trouve dans :

```text
web/
```

Elle est développée avec React, TypeScript et Vite.

Elle permet notamment :

* la connexion ;
* le choix de l'établissement actif ;
* la navigation dans les campagnes ;
* le renseignement du questionnaire ;
* la recherche et le filtrage des questions ;
* la consultation des différentes sphères ;
* le tableau de bord de l'agence comptable ;
* l'administration des utilisateurs ;
* la gestion des rattachements et des rôles.

L'interface est prévue pour fonctionner sur ordinateur, tablette et smartphone.

---

## Référentiel PCIF

Le modèle de données permet de gérer différentes versions du référentiel PCIF.

Les questions sont rattachées à une version de référentiel afin de pouvoir faire évoluer celui-ci sans perdre la cohérence des campagnes existantes.

Le jeu de démonstration ne contient actuellement que quelques questions.

Le référentiel métier complet devra être repris depuis la source PCIF Académie existante afin de conserver les données originales :

* libellés ;
* domaines ;
* poids ;
* étoiles ;
* badges ;
* sphères.

Il n'est volontairement pas recréé ou réinterprété par le serveur.

---

# Installation

## Prérequis

L'installation de référence est actuellement prévue pour Debian 13.

```bash
sudo apt update
sudo apt install -y postgresql nodejs npm
```

Créer ensuite la base PostgreSQL :

```bash
sudo -u postgres psql
```

Puis :

```sql
CREATE ROLE pcif_app LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE pcif_academie OWNER pcif_app;
```

Configurer et initialiser l'application :

```bash
cp .env.example .env
npm install
npm run db:init
npm run db:seed
```

Lancer l'API :

```bash
npm run dev:api
```

Puis, dans un second terminal :

```bash
cd web
npm install
npm run dev
```

L'interface de développement est alors accessible sur :

```text
http://localhost:5173
```

---

## Créer l'administrateur

Un script permet de créer le premier administrateur réel de la plateforme :

```bash
npm run admin:create -- \
  --email admin@domaine.fr \
  --name "Administrateur" \
  --password "MotDePasseSolide!"
```

Ce compte est distinct des comptes utilisés pour les démonstrations.

---

## Données de démonstration

Le seed permet de créer une agence comptable fictive avec plusieurs EPLE et différents profils.

Il sert uniquement au développement et aux tests.

On peut notamment tester les comportements :

| Profil               | Périmètre                           |
| -------------------- | ----------------------------------- |
| Agent comptable      | ensemble des EPLE de l'agence       |
| Fondé de pouvoir     | ensemble des EPLE de l'agence       |
| Chef d'établissement | EPLE de rattachement                |
| SGE                  | EPLE de rattachement                |
| Auditeur             | EPLE de rattachement, lecture seule |

Les comptes et mots de passe de démonstration ne doivent évidemment pas être conservés sur une instance de production.

---

## Mise à jour d'une installation existante

Les évolutions de la base sont appliquées par migrations SQL.

Le rôle Auditeur introduit avec la version 0.5.1 est notamment ajouté par :

```text
sql/003_role_auditeur.sql
```

Cela permet de faire évoluer une installation existante sans réinitialiser ses données.

---

## Déploiement Debian

Un script d'installation est disponible pour Debian 13.

Avec un domaine :

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

## API

Quelques routes utiles :

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

L'API constitue le point de contrôle des autorisations.

Un utilisateur ne doit donc pas pouvoir contourner ses droits simplement en appelant directement une route qui n'est pas proposée dans son interface.

---

## Sécurité

Plusieurs mécanismes sont déjà présents :

* authentification JWT ;
* contrôle des droits côté API ;
* cloisonnement par établissement ;
* rôles par rattachement ;
* journal d'audit append-only ;
* verrouillage optimiste des modifications ;
* amorce de Row Level Security PostgreSQL.

Ce socle ne suffit pas encore pour considérer l'application comme prête à être exposée publiquement.

Avant une mise en production Internet, il reste notamment à consolider :

* l'authentification institutionnelle ou SSO ;
* le MFA si nécessaire ;
* la gestion des sessions et refresh tokens ;
* le rate limiting ;
* les sauvegardes et les tests de restauration ;
* la supervision ;
* la sécurisation du reverse proxy ;
* la politique de journalisation ;
* la gestion des secrets.

---

## Quelques tests à faire

Après une installation ou une évolution importante, quelques vérifications simples permettent de contrôler le cloisonnement :

1. un CE ne voit que les établissements auxquels il est rattaché ;
2. un SGE respecte le même principe ;
3. l'agent comptable voit les établissements de son agence ;
4. le fondé de pouvoir dispose du périmètre prévu ;
5. un auditeur voit ses établissements mais ne peut rien modifier ;
6. un utilisateur ne peut pas accéder directement par l'API à un EPLE hors de son périmètre ;
7. deux modifications concurrentes d'une même réponse déclenchent correctement la gestion de conflit.

Ces contrôles doivent être faits côté API, pas seulement depuis l'interface.

---

## Documentation

La documentation complémentaire du projet se trouve dans :

```text
docs/
```

La documentation de l'interface Web est notamment disponible dans :

```text
docs/WEB-V0.3.md
```

---

## État du projet

PCIF Académie est encore en construction.

Le travail actuel porte surtout sur les fondations : **multi-établissement, gestion des utilisateurs, autorisations, travail collaboratif et séparation claire des sphères Ordonnateur / Comptable / Synthèse**.

L'objectif est maintenant de stabiliser ce socle avant de réintégrer progressivement l'ensemble des fonctions métier de PCIF Académie historique.
