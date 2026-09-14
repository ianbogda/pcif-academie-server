# API v0.1

Toutes les routes `/api/*` hors login attendent :

`Authorization: Bearer <JWT>`

## Modèle d'accès

- rôle établissement : accès uniquement à l'établissement concerné ;
- rôle agence `AGENCY_ACCOUNTANT` / `AGENCY_DEPUTY` : accès aux EPLE actifs rattachés ;
- le CE d'un EPLE ne reçoit pas la liste des autres EPLE ;
- le serveur vérifie l'accès à l'établissement avant lecture/écriture.

## Concurrence

Une réponse est unique par `(campaign_id, question_id, sphere)`.
Le client envoie `version`. Si elle n'est plus courante : HTTP 409.

Cela permet à l'ordonnateur et au comptable de travailler simultanément, y compris
sur une même question mixte, sans écrasement silencieux.
