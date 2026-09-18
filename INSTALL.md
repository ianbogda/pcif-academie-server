# Installation de PCIF Académie

Ce document regroupe les informations techniques nécessaires pour installer, mettre à jour et diagnostiquer PCIF Académie.

## 1. Architecture cible

Le déploiement fourni cible **Debian 13** avec :

- Node.js 22 ;
- PostgreSQL ;
- Caddy ;
- systemd ;
- npm.

Deux environnements peuvent cohabiter :

| Environnement | Répertoire | Service | Port local | Domaine prévu |
| --- | --- | --- | ---: | --- |
| Production | `/opt/pcif-academie-prod` | `pcif-academie-prod` | 3000 | `pcif.eple-tools.fr` |
| Démonstration | `/opt/pcif-academie-demo` | `pcif-academie-demo` | 3001 | `demopcif.eple-tools.fr` |

Les domaines et ports sont actuellement définis dans les scripts de déploiement.

## 2. Pré-requis

- serveur Debian ;
- accès `root` ou `sudo` ;
- DNS du domaine pointant vers le serveur ;
- ports HTTP/HTTPS accessibles pour Caddy et l'émission du certificat ;
- une adresse électronique pour ACME ;
- en production, une adresse électronique pour l'administrateur initial ;
- paramètres SMTP si l'envoi de courriels et la réinitialisation de mot de passe doivent être utilisés.

Le script d'installation installe les paquets système nécessaires, PostgreSQL, Node.js 22 si nécessaire et Caddy.

## 3. Première installation

Décompresser ou cloner le projet sur le serveur, puis se placer à sa racine.

Rendre le script exécutable si nécessaire :

```bash
chmod +x deploy/install-debian13.sh
```

### Production

```bash
sudo ./deploy/install-debian13.sh \
  --environment prod \
  --admin-email admin@domaine.fr \
  --acme-email certificats@domaine.fr
```

Le script demande interactivement le mot de passe de l'administrateur initial. Il doit comporter au moins 12 caractères.

Avec SMTP :

```bash
sudo ./deploy/install-debian13.sh \
  --environment prod \
  --admin-email admin@domaine.fr \
  --acme-email certificats@domaine.fr \
  --smtp-host smtp.domaine.fr \
  --smtp-port 587 \
  --smtp-user compte@domaine.fr \
  --smtp-password 'SECRET' \
  --smtp-from pcif@domaine.fr
```

### Démonstration

```bash
sudo ./deploy/install-debian13.sh \
  --environment demo \
  --acme-email certificats@domaine.fr
```

L'environnement de démonstration est initialisé avec les données de démonstration et dispose d'un mécanisme de remise à zéro périodique.

## 4. Ce que réalise le script d'installation

Le script :

1. installe les dépendances système ;
2. crée le compte système de l'application ;
3. copie les sources dans `/opt/pcif-academie-<environnement>` ;
4. crée le rôle et la base PostgreSQL ;
5. génère le secret JWT et le fichier `.env` ;
6. installe les dépendances npm ;
7. applique les migrations SQL ;
8. importe le référentiel PCIF ;
9. synchronise l'annuaire Éducation ;
10. crée l'administrateur initial en production ou les données de démonstration en démo ;
11. contrôle et compile l'API ;
12. compile le frontend ;
13. crée et active le service systemd ;
14. configure Caddy et HTTPS ;
15. installe les timers nécessaires à la synchronisation de l'annuaire et, en démo, à la remise à zéro.

## 5. Configuration `.env`

Le fichier est créé automatiquement dans le répertoire de l'environnement et protégé en lecture.

Variables principales :

```dotenv
NODE_ENV=production
DEPLOYMENT_ENV=prod
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=...
CORS_ORIGIN=https://pcif.eple-tools.fr
PUBLIC_APP_URL=https://pcif.eple-tools.fr
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Ne pas versionner ni partager le fichier `.env`.

## 6. Base de données et migrations

Les migrations se trouvent dans `sql/` et sont appliquées par :

```bash
npm run db:init
```

La version 0.35 utilise notamment :

- `017_workshop_live_events.sql` — synchronisation des ateliers ;
- `018_personal_notes.sql` — bloc-notes personnel ;
- `019_scoped_resources.sql` — bibliothèque de ressources par périmètre.

Le référentiel PCIF est ensuite importé avec :

```bash
npm run db:reference
npm run db:reference-check
```

## 7. Mise à jour d'une installation existante

Depuis la racine de la nouvelle version :

```bash
sudo ./deploy/update-debian13.sh --environment prod
```

ou :

```bash
sudo ./deploy/update-debian13.sh --environment demo
```

Le script conserve le `.env`, remplace les sources applicatives, réinstalle les dépendances, applique les migrations, réimporte/contrôle le référentiel, reconstruit l'API et le frontend puis redémarre le service.

Avant une mise à jour importante, effectuer une sauvegarde PostgreSQL.

Exemple :

```bash
sudo -u postgres pg_dump pcif_academie_prod > pcif_academie_prod_$(date +%F).sql
```

## 8. Commandes de développement et de maintenance

À la racine du projet :

```bash
npm install
npm run dev
npm run check
npm run build
npm run db:init
npm run db:reference
npm run db:reference-check
npm run db:directory-sync
```

Frontend :

```bash
cd web
npm install
npm run dev
npm run build
```

Création d'un administrateur :

```bash
npm run admin:create -- --help
```

## 9. Services

### Production

```bash
sudo systemctl status pcif-academie-prod
sudo systemctl restart pcif-academie-prod
sudo journalctl -u pcif-academie-prod -n 100 --no-pager
```

### Démonstration

```bash
sudo systemctl status pcif-academie-demo
sudo systemctl restart pcif-academie-demo
sudo journalctl -u pcif-academie-demo -n 100 --no-pager
```

### Synchronisation de l'annuaire

```bash
systemctl status pcif-academie-prod-directory-sync.timer
systemctl status pcif-academie-demo-directory-sync.timer
```

## 10. Contrôle après déploiement

Vérifier d'abord l'API locale :

```bash
curl -fsS http://127.0.0.1:3000/health
```

Pour la démo :

```bash
curl -fsS http://127.0.0.1:3001/health
```

Puis contrôler :

```bash
sudo systemctl status caddy
sudo caddy validate --config /etc/caddy/Caddyfile
```

Enfin tester dans le navigateur : connexion, sélection d'un établissement, ouverture d'une campagne, Pilotage PCIF, Ateliers, ONF, Processus, Mon espace et Administration selon le rôle utilisé.

## 11. Diagnostic rapide

En cas d'erreur applicative :

```bash
sudo journalctl -u pcif-academie-prod -n 100 --no-pager
```

Pour suivre les logs en direct :

```bash
sudo journalctl -u pcif-academie-prod -f
```

Pour vérifier PostgreSQL :

```bash
sudo systemctl status postgresql
```

Pour vérifier Caddy :

```bash
sudo systemctl status caddy
sudo journalctl -u caddy -n 100 --no-pager
```

Une réponse HTTP `400`, `403`, `409` ou `500` doit être diagnostiquée à partir du journal de l'API et de l'onglet Réseau du navigateur avant de modifier les droits ou les données.

## 12. Sécurité

- l'API écoute localement sur `127.0.0.1` et est publiée par Caddy ;
- HTTPS est géré par Caddy ;
- le secret JWT et les identifiants PostgreSQL sont stockés dans `.env` ;
- les mots de passe sont hachés avec bcrypt ;
- les contrôles d'autorisation sont réalisés côté serveur ;
- le service systemd utilise notamment `NoNewPrivileges`, `PrivateTmp` et `ProtectSystem=strict` ;
- le fichier `.env` est créé avec des permissions restrictives.

En production, sauvegarder régulièrement PostgreSQL et tester la restauration des sauvegardes.
