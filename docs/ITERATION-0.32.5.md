# PCIF Académie 0.32.5 — périmètres d’audit RGAA

- choix à la création : ciblé 25, étendu 50 ou complet 106 ;
- sélections 25 et 50 issues des exports ARA fournis ;
- C / NC / NA et fiches de non-conformité inchangés ;
- progression et clôture adaptées au périmètre ;
- suppression possible uniquement pour un audit DRAFT, avec confirmation côté interface et contrôle côté API ;
- rapports 25/50 à considérer comme audits partiels ; audit 106 comme audit complet.

## Note sur les exports fournis
Les exports nommés 25 et 50 contiennent respectivement 23 et 44 critères RGAA explicites. L’application conserve fidèlement ces sélections et calcule la progression sur les critères effectivement présents, sans inventer de critères manquants.
