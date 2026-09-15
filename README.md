# PCIF Académie Server

Application collaborative de pilotage du contrôle interne financier des EPLE.

La version actuelle propose le référentiel PCIF de 267 contrôles, le diagnostic partagé ordonnateur/comptable, la cartographie des risques, les ateliers, le plan d’action et la construction de l’organigramme fonctionnel nominatif (ONF).

Le tableau de bord consolide les données de la campagne active : couverture, maîtrise pondérée, risques prioritaires, plan d’action et résultats par domaine. Il permet aussi une comparaison anonymisée avec les EPLE de l’agence comptable, du département ou de l’académie, lorsque l’échantillon contient des campagnes renseignées.

La navigation sépare clairement cinq espaces : tableau de bord, pilotage PCIF, ateliers, organigramme fonctionnel et processus/logigrammes. Le pilotage regroupe uniquement le diagnostic, les risques et le programme annuel.

## Environnements

| Environnement | Adresse | Particularité |
| --- | --- | --- |
| Production | `https://pcif.eple-tools.fr` | Données pérennes |
| Démonstration | `https://demopcif.eple-tools.fr` | Remise à zéro automatique chaque heure |

Le bouclier PCIF est bleu en production et orange en démonstration.

## Prérequis

- Debian 13 ;
- accès root ou `sudo` ;
- DNS des deux domaines pointant vers le serveur ;
- serveur SMTP pour l’activation des comptes et les mots de passe oubliés.

Node.js, PostgreSQL et Caddy sont installés ou configurés par le script d’installation.

## Installation

Production :

```bash
sudo bash ./deploy/install-debian13.sh \
  --environment prod \
  --admin-email admin@domaine.fr \
  --admin-name "Administrateur" \
  --acme-email certificats@domaine.fr
```

Démonstration :

```bash
sudo bash ./deploy/install-debian13.sh \
  --environment demo \
  --acme-email certificats@domaine.fr
```

Les certificats HTTPS sont délivrés et renouvelés automatiquement par Caddy.

## Mise à jour

```bash
sudo bash ./deploy/update-debian13.sh --environment prod
sudo bash ./deploy/update-debian13.sh --environment demo
```

Le script conserve le fichier `.env`, applique les migrations, reconstruit l’application et redémarre le service concerné.

## Configuration SMTP

Compléter `/opt/pcif-academie-prod/.env` :

```dotenv
PUBLIC_APP_URL=https://pcif.eple-tools.fr
SMTP_HOST=smtp.domaine.fr
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=compte-smtp
SMTP_PASSWORD=mot-de-passe-smtp
SMTP_FROM=PCIF Académie <adresse@domaine.fr>
```

Puis redémarrer :

```bash
sudo systemctl restart pcif-academie-prod
```

Les liens d’activation et de réinitialisation sont personnels, valables une heure et utilisables une seule fois. Aucun mot de passe n’est envoyé par courriel.

## Rôles

- Agent comptable ;
- Fondé de pouvoir ;
- Chef d’établissement ;
- Secrétaire général ;
- Contributeur ;
- Lecteur ;
- Auditeur.

Le rôle d’administrateur de plateforme n’est pas attribuable depuis un simple rattachement établissement.

## Annuaire et carte comptable

- synchronisation quotidienne des établissements secondaires publics depuis l’Annuaire de l’Éducation nationale ;
- recherche et ajout d’un établissement par UAI ou par nom ;
- conservation du département et de l’académie pour les futurs indicateurs comparatifs ;
- création manuelle des agences comptables ;
- import CSV d’une carte comptable avec dates de rattachement et clôture contrôlée des anciens rattachements.

La commande manuelle est `npm run db:directory-sync`.

## Organigramme fonctionnel nominatif

L’atelier ONF permet de :

- créer, modifier et supprimer les acteurs ;
- utiliser une fonction Fonctiop@le ou un intitulé libre ;
- affecter les acteurs aux 181 opérations ;
- renseigner action directe, délégation, validation, contrôle, suppléance et rupture ;
- exporter un fichier HTML Fonctiop@le V5 autonome et un tableur `.xls`.

L’impression s’effectue depuis le fichier HTML Fonctiop@le exporté.

## Développement

```bash
npm install
npm --prefix web install
cp .env.example .env
npm run db:init
npm run db:reference
npm run dev
```

Interface web :

```bash
npm run dev:web
```

Vérifications :

```bash
npm run check
npm run build
npm run build:web
npm run db:reference-check
```

## Services

```bash
sudo systemctl status pcif-academie-prod
sudo systemctl status pcif-academie-demo
sudo journalctl -u pcif-academie-prod -n 100 --no-pager
sudo journalctl -u pcif-academie-demo -n 100 --no-pager
```

## Structure

- `src/` : API Fastify et logique métier ;
- `web/` : interface React ;
- `sql/` : migrations PostgreSQL ;
- `data/` : référentiels PCIF et Fonctiop@le ;
- `deploy/` : installation et mise à jour Debian ;
- `scripts/` : administration et import des référentiels.

## Version

En démonstration, trois campagnes réelles de test — 2024-2025, 2025-2026 et 2026-2027 — alimentent le tableau de bord. Les campagnes historiques sont validées, consultables en lecture seule et contiennent des plans d’action fictifs avec différents niveaux de réalisation.

Le rôle Auditeur dispose d’un mode dédié : analyse des points d’attention, navigation en lecture seule dans la chaîne de maîtrise et observations séparées des données produites par l’établissement. Son périmètre de mission peut viser des EPLE, une agence, un département ou une académie, avec dates de validité.

La matrice technique des rôles est documentée dans `docs/MATRICE-DES-DROITS.md`.

Version actuelle : **0.25.0**.
