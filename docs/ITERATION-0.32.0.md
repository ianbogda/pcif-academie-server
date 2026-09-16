# PCIF Académie 0.32.0 — Audit RGAA

Cette itération ajoute, pour le profil administrateur plateforme, un outil de suivi d'audit RGAA 4.1.2 portant sur les 106 critères.

## Fonctions

- création et historique d'audits ;
- 106 critères répartis dans les 13 thématiques RGAA ;
- réponses C / NC / NA ;
- pour NC : titre, description, correction recommandée, impact Bloquant / Majeur / Mineur et indicateur « facile à corriger » ;
- pour NA : justification obligatoire ;
- preuve / observation ;
- synthèse de progression et résultats ;
- clôture uniquement lorsque les 106 critères sont renseignés ;
- snapshot immuable à la publication ;
- publication / dépublication d'un rapport ;
- rapport public depuis la page Accessibilité ;
- détail public des non-conformités et recommandations sans notes internes sensibles.

## Base de données

Migration `015_accessibility_audits.sql` : `accessibility_audits`, `accessibility_results`, `accessibility_reports`.

## Déploiement

Exécuter `npm run db:init` avant redémarrage du serveur.

## Référentiel

Le module fournit les 106 identifiants officiels et un lien vers le critère RGAA 4.1.2 correspondant. Les intitulés courts embarqués restent volontairement stables ; la référence officielle demeure la source normative.
