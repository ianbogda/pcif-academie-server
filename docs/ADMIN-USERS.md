# Administration utilisateurs

Le compte administrateur plateforme n'est pas lié à un EPLE. Il dispose d'un droit global explicite
`is_platform_admin` et doit être créé via le script `admin:create`.

Chaque utilisateur métier :
- possède un email syntaxiquement valide et unique ;
- possède au moins un rattachement établissement ;
- chaque rattachement porte son propre rôle ;
- peut être rattaché à plusieurs établissements avec des rôles différents.

Suppression = suppression logique : le compte est désactivé, les rattachements sont retirés, la ligne
utilisateur est conservée afin de préserver l'audit historique.

Rôles proposés :
- Chef d'établissement
- Secrétaire général
- Agent comptable
- Fondé de pouvoir
- Contributeur
- Lecteur
- Auditeur


## Auditeur

Le rôle `AUDITOR` est un rôle de consultation. Il peut être attribué établissement
par établissement, y compris à un même auditeur sur plusieurs EPLE. Il donne accès
aux campagnes et aux trois sphères sans autoriser l'écriture.
