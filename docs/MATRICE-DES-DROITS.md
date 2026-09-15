# Matrice des droits PCIF Académie

Cette matrice décrit les droits réellement appliqués par l’API en v0.24.0.

| Fonction | Admin plateforme | Agent comptable | Fondé de pouvoir | Chef d’établissement | Secrétaire général | Contributeur | Lecteur | Auditeur |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Périmètre | Tous les EPLE | Agence comptable | Agence comptable | EPLE rattaché | EPLE rattaché | EPLE rattaché | EPLE rattaché | EPLE rattaché |
| Consulter tableau de bord et campagnes | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Consulter diagnostic, risques et actions | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Répondre pour la sphère ordonnateur | Oui | Non | Non | Oui | Oui | Oui | Non | Non |
| Répondre pour la sphère comptable | Oui | Oui | Oui | Non | Non | Non | Non | Non |
| Renseigner la synthèse | Oui | Oui | Oui | Oui | Oui | Oui | Non | Non |
| Gérer actions et ateliers | Oui | Oui | Oui | Oui | Oui | Oui | Non | Non |
| Modifier ONF et revues de processus | Oui | Oui | Oui | Oui | Oui | Oui | Non | Non |
| Consulter les comparaisons anonymisées | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Administrer utilisateurs, EPLE et agences | Oui | Non | Non | Non | Non | Non | Non | Non |
| Modifier une campagne validée ou archivée | Non | Non | Non | Non | Non | Non | Non | Non |

## Point à arbitrer : Lecteur ou Auditeur ?

Dans l’existant, les rôles **Lecteur** et **Auditeur** sont techniquement identiques. Cette duplication doit être tranchée avant d’ajouter de nouveaux droits.

Deux options cohérentes :

1. supprimer le rôle Lecteur et conserver Auditeur comme profil de consultation contrôlée ;
2. conserver Lecteur pour la consultation courante et réserver Auditeur à une future vue d’audit : historique, preuves, journal des modifications et exports, sans aucune écriture.

La seconde option est la plus utile si PCIF Académie doit accueillir des auditeurs internes, autorités académiques ou missions de contrôle. Elle exige toutefois un véritable journal consultable et une gestion explicite de l’accès aux pièces justificatives.

## Limite actuelle à corriger

Les droits génériques d’écriture sur les actions, ateliers, ONF et processus sont accordés aux rôles contributeurs sans distinction fine de sphère. Une prochaine évolution devrait séparer :

- contribution au diagnostic ;
- pilotage du plan d’action ;
- animation des ateliers ;
- administration de l’ONF ;
- validation d’une campagne.
