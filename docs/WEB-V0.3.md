# Interface Web v0.3

## Parcours disponibles

### AC / Fondé de pouvoir
1. Connexion
2. Tableau de bord agence
3. Vue des 8 EPLE
4. Ouverture d’un établissement
5. Ouverture de sa campagne
6. Questionnaire collaboratif

### CE / SGE
1. Connexion
2. Un seul établissement visible
3. Ouverture de sa campagne
4. Questionnaire

### Administrateur
Le compte administrateur existe mais reste volontairement limité dans cette itération.
La console d’administration et le droit global feront l’objet d’une itération dédiée.

## Questionnaire
- recherche plein texte ;
- filtre domaine ;
- filtre sphère ;
- réponses ordonnateur / comptable / synthèse ;
- score 0 à 3 ;
- commentaire ;
- numéro de version ;
- sauvegarde explicite ;
- détection d’un conflit HTTP 409.

## Développement

Terminal 1 :
```bash
npm run dev:api
```

Terminal 2 :
```bash
cd web
npm install
npm run dev
```

Puis : `http://localhost:5173`

## Production

```bash
cd web
npm install
npm run build
cd ..
npm run build
```

Caddy sert `web/dist` et reverse-proxy `/api/*` vers `127.0.0.1:3000`.


## Autorisations d’écriture par sphère

Les contrôles sont appliqués côté API, l’interface ne fait que les refléter :

- CE / SGE / contributeur établissement : écriture `ORDONNATEUR` ;
- AC / fondé de pouvoir : écriture `COMPTABLE` ;
- `SYNTHESE` : modifiable par les deux familles ;
- une sphère non autorisée reste visible en lecture seule ;
- une tentative directe via API renvoie `403 SPHERE_FORBIDDEN`.
