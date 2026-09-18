# PCIF Académie

**PCIF Académie** est une plateforme collaborative destinée à accompagner les EPLE dans la mise en œuvre et le pilotage du **contrôle interne financier (PCIF)**.

L'application part de l'organisation et des pratiques réelles de l'établissement pour construire progressivement une vision partagée des responsabilités, des processus, des risques, du niveau de maîtrise et des actions à conduire.

> **Organisation → Processus → Risques → Maîtrise → Actions**

## Objectifs

PCIF Académie vise à :

- faire du PCIF une démarche de travail collective plutôt qu'un questionnaire isolé ;
- réunir ordonnateur, secrétaire général, agence comptable et contributeurs autour d'une campagne commune ;
- documenter l'organisation réelle et les responsabilités ;
- identifier et hiérarchiser les risques à partir du référentiel PCIF ;
- suivre la progression du niveau de maîtrise entre les campagnes ;
- formaliser un programme annuel d'actions ;
- faciliter l'accompagnement des établissements par l'agence comptable ;
- permettre une observation et un audit encadrés, en lecture seule ;
- mettre à disposition des acteurs des ressources de formation et de sensibilisation adaptées à leur périmètre.

## La démarche : 4 ateliers

La démarche peut être conduite sous la forme de quatre ateliers d'environ une heure :

1. **Qui fait quoi ?** — identifier les acteurs, responsabilités, délégations et suppléances. Livrable : organigramme fonctionnel nominatif.
2. **Comment travaillons-nous ?** — cartographier les processus et formaliser les procédures prioritaires.
3. **Où sont nos risques ?** — apprécier les risques et le niveau de maîtrise.
4. **Qu'allons-nous faire ?** — construire le programme annuel d'actions et consolider le PCIF.

Les ateliers sont conçus pour décrire d'abord le fonctionnement réel. Les fragilités observées deviennent ensuite des points d'attention et alimentent l'analyse des risques et le plan d'action.

## Fonctionnalités principales

### Pilotage PCIF

- campagnes PCIF par établissement ;
- référentiel de **267 points de contrôle** ;
- réponses distinguant les sphères ordonnateur, comptable et la synthèse ;
- tableau de bord de campagne ;
- indicateurs de maîtrise, progression, risques prioritaires et actions réalisées ;
- diagnostic, cartographie des risques et programme annuel d'actions ;
- comparaison de la progression entre campagnes ;
- export destiné à Cartop@le.

### Ateliers collaboratifs

- quatre ateliers guidés ;
- sessions d'initialisation et de réexamen conservées ;
- atelier 1 animé par une séquence de **60 minutes** avec chronomètre partagé ;
- synchronisation du déroulement entre les participants ;
- animateur / maître du temps désigné ;
- organisation possible par l'agent comptable ou le fondé de pouvoir pour plusieurs établissements ;
- prise de note personnelle depuis l'atelier via un modal.

### Organigramme fonctionnel nominatif

- acteurs, fonctions et responsabilités ;
- délégations, suppléances, validations et contrôles ;
- représentation des sphères ordonnateur et comptable ;
- identification des ruptures et points de supervision ;
- export **Fonctiop@le** et tableur.

### Processus et logigrammes

- cartographie des processus métiers ;
- navigation du macro-processus jusqu'au point de contrôle PCIF ;
- représentation des procédures et points de contrôle ;
- lecture croisée de la progression et de la maîtrise des risques.

### Mon espace

La page personnelle est organisée en **1/3 – 2/3** : profil et sécurité du compte à gauche, ressources et notes à droite.

- consultation de l'identité de connexion ;
- modification sécurisée du mot de passe ;
- bloc-notes personnel : **Note, Pense-bête, À vérifier, Idée** ;
- notes privées, épinglables et marquables comme traitées ;
- notes issues d'un atelier conservant leur contexte ;
- affichage des notes sous forme de post-it ;
- ressources présentées en cartes sur deux colonnes.

### Bibliothèque de ressources

Les ressources visibles dans « Mon espace » sont agrégées selon le périmètre de l'établissement actif :

- **agence comptable** : publication par l'agent comptable / les profils autorisés de l'agence ;
- **département** : publication par l'administrateur départemental ;
- **académie** : publication par l'administrateur académique ;
- **plateforme** : publication par l'administrateur plateforme pour tous.

Une ressource peut comporter un titre, une description, une catégorie, un organisme, une durée, un lien et une vignette. Elle peut être en **brouillon, publiée ou archivée**. Les quatre formations Mentor intégrées au projet constituent les ressources plateforme initiales.

### Audit

- profil Auditeur en lecture seule ;
- missions ouvertes sur une campagne déterminée ;
- période d'accès de date à date ;
- ouverture, clôture et révocation des missions ;
- consultation de l'ONF, des processus et des données de campagne sans modification des données produites par l'établissement.

### Administration

Selon le rôle et le périmètre :

- gestion des utilisateurs et des rôles ;
- agences comptables et rattachements ;
- périmètres établissement / agence ;
- gestion des missions d'audit ;
- gestion des ressources partagées ;
- réinitialisation du mot de passe des utilisateurs ;
- administration et suivi de la plateforme pour l'administrateur plateforme.

### Accessibilité et aide

- aide contextuelle intégrée ;
- audit RGAA avec statuts, criticité et suivi de progression ;
- publication des informations d'accessibilité ;
- pages de conformité et informations RGPD/CNIL prévues dans l'interface.

## Profils

PCIF Académie distingue notamment :

- Administrateur plateforme ;
- Administrateur académique ;
- Administrateur départemental ;
- Agent comptable ;
- Fondé de pouvoir ;
- Chef d'établissement ;
- Secrétaire général d'EPLE ;
- Contributeur ;
- Auditeur.

Les autorisations sont contrôlées côté serveur selon le rôle et le périmètre de l'utilisateur.

## Architecture

- **Frontend** : React + TypeScript + Vite ;
- **API** : Node.js + Fastify + TypeScript ;
- **Base de données** : PostgreSQL ;
- **Authentification** : JWT, mots de passe hachés avec bcrypt ;
- **Reverse proxy / HTTPS** : Caddy ;
- **Déploiement cible** : Debian 13, services systemd ;
- environnements distincts **production** et **démonstration**.

Le détail de l'installation, de la mise à jour, des migrations et des contrôles techniques est regroupé dans [`INSTALL.md`](INSTALL.md).

## État du projet

Version actuelle : **0.35.x**.

Le projet évolue par itérations. Le README décrit volontairement le produit et ses usages ; l'historique détaillé des petites corrections de version n'est plus conservé sous forme de multiples README.
