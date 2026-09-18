# PCIF Académie v0.34.0 — Profil & ressources

## Nouveautés
- accès **Mon profil** depuis la barre horizontale ;
- consultation de l’identité de connexion ;
- modification sécurisée du mot de passe (mot de passe actuel requis, 12 caractères minimum) ;
- espace **Mes ressources** avec quatre formations Mentor : RGP, contrôle interne et maîtrise des risques, démarche qualité, contrôle de gestion ;
- liens externes ouverts dans un nouvel onglet avec durée et présentation synthétique.

## Sécurité
Le changement de mot de passe est réalisé côté serveur après vérification du mot de passe actuel avec bcrypt. Les jetons de réinitialisation encore ouverts sont invalidés après modification.

## Déploiement
Aucune migration SQL n’est nécessaire pour cette itération. Recompiler le serveur et le frontend selon la procédure habituelle.
