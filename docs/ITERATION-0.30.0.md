# PCIF Académie 0.30.0 — Références PCIF et niveau de risque

## Évolutions

- les références PCIF des procédures simplifiées sont interactives ;
- un clic affiche le domaine, le libellé du point de contrôle et son niveau de risque ;
- le niveau de risque est présenté selon la convention **Probabilité × Gravité = Niveau de risque** ;
- un lien permet d'ouvrir directement la question concernée dans le diagnostic de la campagne ;
- les diagnostics et cartographies utilisent désormais `P × G = …/9` ;
- la cartographie détaille Probabilité, Gravité et Niveau de risque ;
- l'aide et le glossaire sont alignés sur cette terminologie.

## Compatibilité des données

Le champ technique historique `occurrence` est conservé dans les données et l'API pour éviter une migration cassante. Il est interprété et présenté à l'utilisateur comme **Probabilité**. Aucune réécriture des sources historiques n'est effectuée.
