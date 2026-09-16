# PCIF Académie 0.32.4 — Correctif ouverture audit RGAA

- corrige la page blanche provoquée par un accès à `detail.stats` alors que le détail était encore `null` ;
- charge désormais le détail avant de basculer vers le questionnaire ;
- ajoute un état de chargement accessible ;
- affiche une erreur de chargement au lieu d’une page blanche ;
- sécurise `stats` avec des valeurs par défaut ;
- protège le module d’audit avec un Error Boundary React.
