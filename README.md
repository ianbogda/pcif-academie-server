# PCIF Académie — v0.17.5 — routage API et migration du service historique

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

## Déploiements Debian 13

Deux instances strictement séparées peuvent cohabiter sur le même VPS :

| Environnement | URL | Port local | Base | Données |
|---|---|---:|---|---|
| Production | `https://pcif.eple-tools.fr` | 3000 | `pcif_academie_prod` | aucune donnée de démo |
| Démonstration | `https://demopcif.eple-tools.fr` | 3001 | `pcif_academie_demo` | RAZ automatique chaque heure |

Installation de production (l'email et le nom sont passés en paramètres ; le mot de passe est demandé sans être affiché) :

```bash
sudo ./deploy/install-debian13.sh --environment prod \
  --admin-email admin@eple-tools.fr \
  --admin-name "Administrateur PCIF Académie" \
  --acme-email certificats@eple-tools.fr
```

L'installation crée l'administrateur initial. Elle refuse cet amorçage si un
administrateur actif existe déjà.

Installation de la démonstration :

```bash
sudo ./deploy/install-debian13.sh --environment demo \
  --acme-email certificats@eple-tools.fr
```

La remise à zéro horaire est assurée par `pcif-academie-demo-reset.timer`.
Le timer n'est activé qu'après validation de l'API locale et du domaine HTTPS ;
il ne déclenche donc plus de remise à zéro concurrente au premier démarrage.
Le script vérifie simultanément l'environnement, le nom de la base, le
répertoire et le service avant toute suppression. Il ne peut donc pas cibler
la production par simple erreur de paramétrage.

### Certificats TLS

Caddy obtient et renouvelle automatiquement les certificats auprès de
Let's Encrypt. Avant l'installation, les enregistrements DNS A/AAAA des deux
domaines doivent pointer vers le VPS et les ports TCP 80 et 443 doivent être
accessibles publiquement. Le script valide la configuration Caddy puis vérifie
chaque domaine en HTTPS.

Contrôles utiles :

```bash
sudo journalctl -u caddy --since "30 minutes ago"
sudo caddy validate --config /etc/caddy/Caddyfile
curl -I https://pcif.eple-tools.fr
curl -I https://demopcif.eple-tools.fr
```

Le renouvellement est géré par Caddy ; aucun cron Certbot ne doit être ajouté.

Si une ancienne installation déclarait directement un domaine PCIF dans
`/etc/caddy/Caddyfile`, l'installateur retire uniquement ce bloc, en conserve
une sauvegarde horodatée, puis utilise le fichier dédié dans
`/etc/caddy/sites/`. Cela évite les définitions de site ambiguës.

L'environnement de démonstration affiche en permanence un bandeau ambre
indiquant que les données sont réinitialisées chaque heure. Aucun bandeau
n'apparaît en production.

Les routes `/api/*` et `/health` utilisent des blocs Caddy `handle`
exclusifs : le fallback de la SPA ne peut plus les réécrire vers
`index.html`. Lors d'une migration de production, l'ancien service
`pcif-academie.service` est arrêté et désactivé avant le démarrage de
`pcif-academie-prod.service`, afin de libérer le port 3000.

Mise à jour ciblée :

```bash
sudo ./deploy/update-debian13.sh --environment prod
sudo ./deploy/update-debian13.sh --environment demo
```

## Installation locale de développement

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


## v0.5
- identité visuelle réintégrée depuis PCIF Académie historique (Light Bootstrap Dashboard) ;
- application autonome : navigation PCIF, établissement actif discret ;
- multi‑établissement conservé ;
- administrateur plateforme réel ;
- administration utilisateurs : création, modification, suspension, réactivation, suppression logique ;
- email validé côté API ;
- un utilisateur doit être rattaché à au moins un établissement ;
- un rôle est défini pour chaque rattachement ;
- script de création administrateur :

```bash
npm run admin:create -- --email admin@domaine.fr --name "Administrateur" --password "MotDePasseSolide!"
```


## v0.5.1 — rôle Auditeur

Ajout du rôle `AUDITOR` / **Auditeur**.

Un auditeur :
- est rattaché à un ou plusieurs établissements ;
- voit les campagnes et l'ensemble des sphères PCIF de ces établissements ;
- peut consulter les réponses Ordonnateur, Comptable et Synthèse ;
- ne dispose d'aucun droit de modification ;
- peut être géré depuis l'administration utilisateurs comme les autres rôles.

Le rôle est ajouté automatiquement sur une installation existante via la migration
`sql/003_role_auditeur.sql`.


## v0.6.0

- retour à la première direction visuelle : **observatoire / cockpit académique**, sombre, cartographique et orienté pilotage ;
- abandon du retour au thème historique Light Bootstrap de la v0.5 ;
- intégration du **référentiel PCIF Académie de 267 questions** ;
- import versionné et idempotent via `npm run db:reference` ;
- domaines, catégories, sphères, poids, point-clé/badge et risque associés conservés ;
- filtre domaine + sphère dans le parcours ;
- rôle Auditeur conservé en lecture seule ;
- multi-établissement, administration utilisateurs et auto-installateur conservés.

Le référentiel embarqué est dans `data/pcif-reference-267.json`.


## Correctif v0.6.1

La v0.6.0 utilisait par erreur les noms de tables `question_repositories` et
`question_repository_versions`. Le schéma réel utilise `repositories` et
`repository_versions`.

La v0.6.1 corrige :
- l'import des 267 questions ;
- la compatibilité avec le schéma existant ;
- le redémarrage de secours du service en cas d'échec du script de mise à jour ;
- `/health`, qui lit désormais la version depuis `package.json`.


## Correctif v0.6.2

Le schéma initial définit `questions.badge` comme un entier 0–5. La v0.6.0/0.6.1
lui envoyait à tort `NULL` ou `POINT_CLÉ`.

La v0.6.2 distingue désormais :
- `badge` : entier, conservé compatible avec le schéma ;
- `is_key` : booléen indiquant un point clé ;
- les badges de maîtrise 0–5 restent une métrique agrégée par domaine, à calculer
  à partir des réponses et de la couverture, comme dans PCIF Académie historique.

L'import reste idempotent et porte sur exactement 267 questions.


## Correctif v0.6.3

Correction TypeScript du frontend : `Question.badge` était déclaré deux fois.
Il n'existe désormais qu'une seule définition :

```ts
badge: number;
```

`is_key?: boolean` reste distinct pour identifier les points clés.


## v0.6.4 — update Debian 13

`deploy/update-debian13.sh` redémarre maintenant explicitement :

1. PostgreSQL ;
2. PCIF Académie ;
3. Caddy, s'il est installé.

Le script attend jusqu'à 30 secondes que `/health` réponde avant de poursuivre.
Si PCIF tombe pendant le démarrage, il affiche automatiquement le statut systemd
et les 80 dernières lignes du journal.

La configuration Caddy de l'auto-installateur utilise aussi désormais des blocs
`handle` séparés pour `/api/*`, `/health` et la SPA.


## v0.6.5

Correction du démarrage production.

La lecture de version utilisait un chemin relatif au fichier compilé :

```ts
new URL("../package.json", import.meta.url)
```

Depuis `dist/src/server.js`, cela pointait vers `dist/package.json`.

La version est désormais lue depuis le répertoire de travail du service systemd :

```ts
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
```

Avec `WorkingDirectory=/opt/pcif-academie`, le fichier lu est donc
`/opt/pcif-academie/package.json`.


## v0.7.0 — mécanismes de `pilotage-pcif.html`

Cette itération réintègre dans l'application multi-utilisateur :

- cycle de vie du PCIF en 3 temps ;
- diagnostic avec Parcours complet / Sprint 20 / Risques ≥ 6 / Non répondues ;
- réponses métier Oui / Partiel / Non / N/A ;
- couverture et maîtrise pondérée ;
- badges de maîtrise 0 à 5 par domaine ;
- radar de maîtrise ;
- matrice Gravité × Occurrence ;
- cartographie détaillée des risques résiduels ;
- programme annuel de maîtrise persisté en PostgreSQL ;
- priorités P1/P2/P3/P4, pilote, échéance et statut ;
- ateliers PCIF 4 × 60 minutes persistés en PostgreSQL.

Contrairement au fichier HTML autonome, les données ne sont pas conservées dans
`localStorage` : elles sont liées à la campagne et à l'établissement dans PostgreSQL.


## v0.8.0

Intégration des deux briques suivantes issues de `pilotage-pcif.html` :

- référentiel FONCTIOP@LE V5.0 : **181 opérations**, **7 domaines** ;
- cartographie PCIF : **39 procédures opérationnelles** reliées aux 267 contrôles.

### ONF
- acteurs nominatifs ;
- plusieurs intervenants par opération ;
- A = action directe ;
- D = délégation ;
- S = suppléance ;
- rupture majeure formalisée ou non ;
- absence de rupture à corriger / justifiée ;
- contrôle de supervision ;
- couverture et KPI ONF ;
- matrice récapitulative persistée en PostgreSQL.

### Processus et logigrammes
- 39 cartes procédures ;
- filtres par domaine ;
- ouverture détaillée ;
- logigramme SVG à partir des étapes de référence ;
- affichage des questions PCIF associées ;
- marquage procédure prioritaire ;
- statut À examiner / En cours / Sécurisée ;
- notes d'écarts au terrain persistées.

Les référentiels sources sont embarqués dans :
- `data/fonctiopale-v5-181.json`
- `data/pcif-processes-39.json`


## v0.9.0

- l'écran de campagne utilise réellement `PilotagePcif` : le parcours historique simplifié n'est plus le point d'entrée ;
- la démo est synchronisée sur `PCIF-267-2026.09` ;
- 8 EPLE de démonstration sont rattachés à l'agence comptable Rémi Belleau ;
- AC et FP voient les 8 EPLE ; CE, SGE et Auditeur voient leur seul EPLE ;
- un préremplissage léger rend radar, risques et progression visibles immédiatement ;
- administration des établissements : création, modification, activation/suspension ;
- administration des agences comptables : création, établissement support, rattachement/détachement des EPLE, activation ;
- nouvel onglet Administration : Utilisateurs / Établissements / Agences comptables ;
- `db:demo-sync` migre automatiquement les anciennes campagnes `PCIF Démo` vers le référentiel 267 lors d'une mise à jour.


## v0.10.0 — diagnostic guidé et mesures correctives

- catalogue PCIF Académie intégré pour 110 questions disposant de plans d’action ;
- choix multiples de mesures correctives dès une réponse Non / Partiel avec risque brut ≥ 6 ;
- acteurs proposés, échéances et critères d’évaluation issus du catalogue ;
- fiches réflexes : avant d’agir, mise en œuvre, contrôles de fin et preuves à conserver ;
- sélection directe des mesures vers le programme annuel PostgreSQL ;
- programme annuel restructuré autour des risques et mesures proposées ;
- matrice des risques corrigée : axe vertical = Gravité, axe horizontal = Occurrence ;
- positionnement par G × O brut ; comptage uniquement des risques résiduels (Non / Partiel) ;
- résiduel : Non = brut ; Partiel = brut × 0,5 ;
- criticité résiduelle : ≥6 Critique, ≥4 Élevée, ≥2 Modérée, sinon Faible.


## v0.10.1 — référentiel PCIF 267 obligatoire

- correction du ciblage des 8 UAI de démonstration ;
- migration des campagnes de démonstration actives vers `PCIF-267-2026.09` ;
- archivage des anciennes campagnes actives utilisant le mini-référentiel ;
- suppression des réponses de démonstration incompatibles lors de la migration ;
- vérification stricte que le référentiel importé contient exactement 267 questions ;
- `db:reference-check` contrôle toutes les campagnes actives ;
- les campagnes validées ou archivées conservent leur référentiel historique ;
- l'API expose le nombre de questions du référentiel de chaque campagne.


## v0.11.0 — thème clair EPLE Tools

Refonte visuelle sans modification des règles métier :

- Bootstrap 5.3 chargé localement via npm ;
- fond général `#f7f8fb` ;
- cartes et navigation blanches ;
- bordures `#e7eaf0` ;
- bleu principal `#2563eb` ;
- accent EPLE Tools turquoise `#0f9f8f` ;
- ombres très légères ;
- formulaires et modales harmonisés ;
- couleurs PCIF réservées à la sémantique métier :
  - Ordonnateur : orange ;
  - Comptable : bleu ;
  - Mixte : violet ;
  - Criticité : vert / jaune / orange / rouge.

Le thème sombre historique est retiré visuellement mais les composants et mécanismes
de PCIF Académie restent inchangés.


## v0.11.1 — correctif npm / Bootstrap

Le thème clair v0.11.0 ajoutait Bootstrap dans `web/package.json` sans fournir un
`package-lock.json` régénéré. Sur une installation existante, `npm ci` pouvait donc
échouer avec `EUSAGE`.

Le script de déploiement tente maintenant `npm ci` lorsque le lock est utilisable,
puis bascule automatiquement sur `npm install` si le lock est désynchronisé. Cela
régénère le lock avec Bootstrap et `@popperjs/core`.


## v0.12.0 — ateliers PCIF persistants

Les quatre ateliers deviennent un dispositif permanent du cycle PCIF :

- atelier 1 « Qui fait quoi ? » : organisation réelle ;
- atelier 2 « Comment travaillons-nous ? » : processus ;
- atelier 3 « Où sont nos risques ? » : risques et maîtrise ;
- atelier 4 « Qu’allons-nous faire ? » : plan d’action.

Une session peut servir à l’initialisation ou au réexamen en cours d’année. Les sessions
sont historisées avec date, participants, motif, notes, décisions, critères de sortie,
livrable, état et prochaine date de revue.

États : À préparer → En cours → Session terminée → À réinterroger.

La migration `009_workshop_sessions.sql` conserve l’ancien résumé d’atelier et ajoute
les sessions historisées sans supprimer les données existantes.

Les `package-lock.json` racine et Web doivent être versionnés et synchronisés avec
leurs `package.json`; le déploiement nominal reste `npm ci`.

## v0.13.0 — Atelier 1 : constructeur ONF

L'atelier 1 est ramené à quatre étapes utiles, le contexte EPLE/agence/campagne étant déjà connu :

1. Acteurs — population ONF et propositions issues des comptes PCIF de l'EPLE et de l'agence ;
2. Opérations — bibliothèque Fonctiop@le, affectations Réalise / Valide / Contrôle / Supplée ;
3. Sécurisation — détection des absences de suppléance, dépendances à une personne, conflits de sphère et délégations à documenter ;
4. ONF — matrice consolidée et validation d'une version datée.

Les acteurs ONF sont distincts des comptes PCIF : un utilisateur connu peut être proposé, mais un acteur métier sans compte peut être ajouté manuellement.
Les versions validées sont stockées sous forme de snapshots pour permettre la réinterrogation de l'ONF dans l'année.


## v0.14.0 — ONF : travailler par domaine et processus

L'étape 2 de l'atelier 1 est réorganisée pour éviter une saisie opération par opération :

- filtres Domaine > Processus / sous-catégorie > Recherche opération ;
- compteurs de couverture par domaine ;
- filtres de sphère et « opérations non couvertes uniquement » ;
- affectation en masse d'un acteur et d'un rôle à toutes les opérations compatibles d'un processus ;
- quatre rôles : Réalise, Valide, Contrôle, Supplée ;
- conservation de l'ajustement fin au niveau de chaque opération.

L'affectation en masse complète l'existant au lieu de l'écraser : les exceptions restent modifiables opération par opération.

## v0.15.0 — ONF opérationnel & exports

- affectation multiple d'un acteur à une sélection d'opérations, en ajout ou retrait ;
- sélection de toutes les opérations du filtre courant ;
- aperçu final de l'ONF sous forme de matrice opérations × acteurs, avant impression ;
- export HTML compatible avec la présentation Fonctiop@le ;
- sortie PDF via l'aperçu d'impression A4 paysage du navigateur ;
- export tableur Excel XML `.xls`, sans dépendance applicative supplémentaire ;
- conservation des codes action directe, délégation, suppléance, validation et contrôle.


## v0.16.0
- correction définitive de `roleLabel` ;
- cartouche ONF enrichi : établissement, UAI, agence, date, CE, SGE, AC, fondé de pouvoir, campagne et version ;
- séparation visuelle des sphères ordonnateur / comptable ;
- qualification des cinq états Fonctiop@le de rupture / supervision ;
- restitution des ruptures dans l’aperçu, l’impression/PDF, l’export HTML et le tableur.

## v0.18.0 — Atelier 1 prêt à animer

- ajout, modification et suppression des acteurs ONF, avec suppression contrôlée de leurs affectations ;
- fonctions usuelles Fonctiop@le proposées dans une liste, tout en autorisant un intitulé libre ;
- contrôle des changements de sphère lorsqu’un acteur possède déjà des affectations ;
- saisie complète Réalise / Délègue / Valide / Contrôle / Supplée ;
- observations enregistrées à la sortie du champ afin de garder une frappe fluide ;
- export autonome Fonctiop@le V5 contenant le catalogue complet des 181 opérations.

## v0.18.1 — Export Fonctiop@le natif

- l’export HTML réutilise désormais l’application Fonctiop@le V5 complète et embarque les données saisies dans PCIF Académie ;
- les fonctions normalisées alimentent leurs colonnes natives et les autres acteurs deviennent des colonnes libres ;
- les actions directes, délégations, suppléances et ruptures sont injectées dans les cellules Fonctiop@le ;
- l’impression/PDF s’effectue depuis le véritable rendu Fonctiop@le, avec sa légende, ses couleurs et sa mise en page A4 paysage.
