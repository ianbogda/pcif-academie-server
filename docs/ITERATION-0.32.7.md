# PCIF Académie 0.32.7 — Gestion déléguée des utilisateurs

- Administrateur plateforme : gestion globale inchangée.
- Agent comptable : gestion des utilisateurs des établissements de son agence ; profils autorisés AC, FP, CE, SGE, Contributeur.
- Chef d’établissement : gestion des utilisateurs de son établissement ; profils autorisés CE, SGE, Contributeur.
- Les contrôles de périmètre et de rôles sont appliqués côté serveur, pas seulement dans l’interface.
- Lors de la création, possibilité de générer un mot de passe initial aléatoire.
- Le mot de passe généré n’est retourné qu’à la création et un message prêt à envoyer peut être copié dans le presse-papiers.
- Sans génération de mot de passe, le workflow existant de lien d’activation SMTP est conservé.
- Pour un gestionnaire délégué, modifier ou retirer un utilisateur n’altère pas ses rattachements situés hors du périmètre géré.
