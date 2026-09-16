# Aide intégrée PCIF Académie — v0.29

Le corpus fonctionnel affiché par l'application est défini dans `web/src/HelpCenter.tsx`.

Principes :
- l'aide fonctionne sans service d'IA ;
- les recommandations sont contextualisées selon l'écran et le rôle ;
- les ateliers ne sont pas proposés à l'auditeur ;
- ONF et logigrammes sont explicités comme lecture seule pour l'auditeur ;
- l'espace `PCIF Copilot · Future` distingue Disponible / En développement / Envisagé ;
- les fonctions Future ne sont pas présentées comme disponibles.

Le composant contient le corpus initial (découverte, campagne, ateliers, ONF, processus,
référentiel 267, sphères, risques, cartographie, indicateurs, actions, audit, habilitations,
Cartop@le, rôles, Copilot, glossaire, FAQ, sécurité et sources) ainsi que trois parcours guidés.

## Trajectoire

Lors du branchement futur à `copilot.eple-tools.fr`, conserver cette aide comme source autonome.
Le service Copilot pourra la référencer mais ne doit pas devenir une dépendance nécessaire à son affichage.
