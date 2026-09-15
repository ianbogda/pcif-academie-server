# Matrice des droits PCIF Académie

Cette matrice décrit les droits réellement appliqués par l’API en v0.25.0.

| Fonction | Admin plateforme | Agent comptable | Fondé de pouvoir | Chef d’établissement | Secrétaire général | Contributeur | Lecteur | Auditeur |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Périmètre | Tous les EPLE | Agence comptable | Agence comptable | EPLE rattaché | EPLE rattaché | EPLE rattaché | EPLE rattaché | Mission : EPLE, agence, département ou académie + dates |
| Consulter tableau de bord et campagnes | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Consulter diagnostic, risques et actions | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Répondre pour la sphère ordonnateur | Oui | Non | Non | Oui | Oui | Oui | Non | Non |
| Répondre pour la sphère comptable | Oui | Oui | Oui | Non | Non | Non | Non | Non |
| Renseigner la synthèse | Oui | Oui | Oui | Oui | Oui | Oui | Non | Non |
| Gérer actions et ateliers | Oui | Oui | Oui | Oui | Oui | Oui | Non | Non |
| Modifier ONF et revues de processus | Oui | Oui | Oui | Oui | Oui | Oui | Non | Non |
| Consulter les comparaisons anonymisées | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui |
| Accéder au mode Audit orienté points d’attention | Oui | Non | Non | Non | Non | Non | Non | Oui |
| Déposer une observation séparée | Non | Non | Non | Non | Non | Non | Non | Oui |
| Administrer utilisateurs, EPLE et agences | Oui | Non | Non | Non | Non | Non | Non | Non |
| Modifier une campagne validée ou archivée | Non | Non | Non | Non | Non | Non | Non | Non |

## Distinction Lecteur / Auditeur

Le rôle **Auditeur** est désormais distinct du Lecteur : il conserve une lecture complète mais dispose en plus du mode Audit et du droit de déposer des observations séparées. Il ne peut modifier aucune donnée métier.

Le Lecteur consulte les restitutions courantes. L’Auditeur dispose d’une mission bornée par un périmètre et des dates, d’un mode d’analyse dédié et, lorsque sa mission l’autorise, du dépôt d’observations. Ces observations ne modifient jamais les réponses, scores ou actions de l’établissement.

## Limite actuelle à corriger

Les droits génériques d’écriture sur les actions, ateliers, ONF et processus sont accordés aux rôles contributeurs sans distinction fine de sphère. Une prochaine évolution devrait séparer :

- contribution au diagnostic ;
- pilotage du plan d’action ;
- animation des ateliers ;
- administration de l’ONF ;
- validation d’une campagne.
