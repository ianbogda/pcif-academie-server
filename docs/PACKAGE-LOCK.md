# Politique package-lock

Les deux fichiers suivants font partie du code source et doivent être versionnés :

- `/package-lock.json`
- `/web/package-lock.json`

Règle :
1. toute modification de `package.json` est suivie d'un `npm install` dans le même répertoire ;
2. le `package-lock.json` modifié est commité dans la même branche ;
3. le déploiement nominal utilise `npm ci` ;
4. le fallback `npm install` du script de mise à jour sert uniquement à réparer une ancienne installation dont le lock est absent ou désynchronisé ;
5. après cette réparation, les locks générés sur la branche de développement doivent être commitées avant la livraison suivante.
