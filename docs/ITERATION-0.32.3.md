# PCIF Académie 0.32.3 — Workflow d’audit RGAA

- Un audit en brouillon ouvre le questionnaire des 106 critères.
- Actions contextuelles : Commencer, Continuer, Vérifier et clôturer.
- À 106/106, l’administrateur valide et clôture explicitement l’audit.
- La publication n’est proposée qu’après clôture.
- Après publication, l’action principale ouvre le rapport public.
- Le statut technique DRAFT est présenté comme « Brouillon ».
- La reprise positionne l’utilisateur vers le premier critère non renseigné.
- La création réutilise le brouillon courant de la même version au lieu de créer un doublon.
- La liste masque les anciens brouillons dupliqués d’une même version, sans supprimer leurs données.
- La publication est idempotente : un audit déjà publié n’engendre pas un second rapport actif.
