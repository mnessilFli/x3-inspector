# Guide : publier YINDEXAPI et YLAPI en GraphQL (lecture seule)

> **Piste abandonnée le 2026-10-02** (trop lourde : Developer Studio branché sur la base, déploiement et
> redémarrage des services X3). Retenu à la place : requêtes SQL prêtes à l'emploi dans l'onglet SQL de
> X3 Inspector (« Connector queries »), exécutées par le Companion on-premise ou copiées dans le
> requêteur SQL de X3 (GESALQ). Ce document reste comme référence.

But : que X3 Inspector (CONNECTOR > Logs & index, QUERY, OBJECTS) lise l'index des Id Salesforce et le
Log API du connecteur sur X3 Cloud, où il n'y a pas d'accès SQL.

**Règle absolue : ne pas toucher au package X6FLS (`@flowline/flowline-x6fls`, « Flow Stock », vertical
Frontstock).** Le connecteur a son propre package, créé à côté.

Statut : procédure construite à partir de la documentation Sage et de vos écrans PREPROD du 2026-10-02.
Jamais réalisée. Les points non couverts par la documentation sont marqués **À CONFIRMER**. Tout se fait
d'abord en **PREPROD**.

## Ce qui est établi

| Fait | Source |
|---|---|
| Chemin des fonctions API : Développement > Dictionnaire données > API (Packages, Modèles de données, Node bindings) | vos captures (fil d'Ariane) |
| Chaîne Sage : Packages → Modèles de données → noms de propriétés API → Node bindings (Validation) → génération du package | aide en ligne GESANODEB (prérequis), guide X3 Builder « Add your custom fields and tables » |
| Les noms de propriétés API se saisissent dans le dictionnaire de la table (colonne « Nom de propriété (API) ») | vos exports des colonnes YINDEXAPI / YLAPI |
| Un node sans opération (GESAPIOPE) n'a que des lectures | aide en ligne GESAPIOPE |
| Le package X6FLS est publié dans le schéma sous le nom `flowlineX6Fls` | export du schéma GraphQL (captures) |
| Colonnes YINDEXAPI : CODFIC, CLE (200), NUMIDD « Numéro ID distant » (50), NUMLOG, UPDDATMOD, UPDTIMMOD, liens Y* et YCLELNK* | export « yindexapi colonne.csv » |
| Colonnes YLAPI : YCOMPT (index YLAPI0), YTYPFLUX (menu 5055), YACT, YNAMWS, YCLEF1-3, YTRACE, YFIC, YDATE, YHEURE, YSTA (menu 1054), YMESS, YOBJ, YFLUX, YTEX (texte long) | exports « ylapi colonne.csv » et « ylapi index.csv » |

## Étape 0 : avant de commencer

1. Dans YINDEXAPI, la colonne **YFACILITY** a déjà le nom de propriété API `code` : demander qui l'a saisi
   et pourquoi avant de toucher à cette table.
2. Une mise à jour ou réinstallation du connecteur peut réécrire son dictionnaire (skill connecteur-dhm-fli :
   les patchs de livraison écrasent par Rewrite les ajustements manuels). Noter ce qui est saisi ici pour
   pouvoir le refaire.

## Étape 1 : créer le package du connecteur

Menu : **Développement > Dictionnaire données > API > Packages**, bouton **Créer**.

| Champ | Valeur | Pourquoi |
|---|---|---|
| Package | `YCAPI` | code spécifique (X, Y, Z) |
| Propriétaire | `FLOWLINE` | même propriétaire que X6FLS (simple espace de nom) |
| Nom du package | `@flowline/flowline-ycapi` | même convention que `@flowline/flowline-x6fls` |
| Description | `Connecteur API Salesforce` | |
| Actif | coché | |
| Module | celui du code activité YCAPI | **ne pas cocher « Package principal pour module »** si c'est « Module spécifique 1 » (déjà le principal de X6FLS) |
| Type | Application | |
| Package de liaison | décoché | |
| Code activité (spécifique), ligne 1 | `YCAPI` | les codes spécifiques doivent être rattachés au package |

**Enregistrer.** Nom attendu dans GraphQL : `flowlineYcapi` (déduit de `flowline-x6fls` → `flowlineX6Fls`).

## Étape 2 : noms de propriétés API dans les tables

Menu : **Développement > Dictionnaire données > Tables**, ouvrir la table, onglet des colonnes, colonne
**Nom de propriété (API)**. Format camelCase. X3 Inspector reconnaît les tables par les codes des
champs : les noms ci-dessous sont des propositions, pas des obligations.

**YINDEXAPI**

| Colonne | Nom de propriété (API) |
|---|---|
| CODFIC | `tableCode` |
| CLE | `x3Key` |
| NUMIDD | `salesforceId` |
| NUMLOG | `lastLogNumber` |
| UPDDATMOD | `modificationDate` |
| UPDTIMMOD | `modificationTime` |
| YFACILITY | laisser `code` tel quel (voir étape 0) |

**YLAPI**

| Colonne | Nom de propriété (API) | Colonne | Nom de propriété (API) |
|---|---|---|---|
| YCOMPT | `counter` | YDATE | `logDate` |
| YTYPFLUX | `flowType` | YHEURE | `logTime` |
| YACT | `action` | YSTA | `requestStatus` |
| YNAMWS | `webServiceName` | YMESS | `returnMessage` |
| YFLUX | `flowCode` | YTEX | `returnText` (texte long : voir la page Sage « CLOB and BLOB data types ») |
| YOBJ | `x3Object` | YTRACE | `traceFile` |
| YCLEF1 / YCLEF2 / YCLEF3 | `key1` / `key2` / `key3` | YFIC | `fileName` |

Puis **Enregistrer** et **Validation** de la table (en PREPROD d'abord).

## Étape 3 : un modèle de données par table

Menu : **Développement > Dictionnaire données > API > Modèles de données**, bouton **Créer**
(même écran que API_CONTACT_6).

| Champ | Index | Log API |
|---|---|---|
| Code modèle | `YAPI_INDEX` | `YAPI_LOG` |
| Intitulé | `Index Id Salesforce` | `Log API connecteur` |
| Actif | coché | coché |
| Code activité | `YCAPI` | `YCAPI` |
| Module | celui de l'étape 1 | idem |
| Node (API) | **coché** | **coché** |
| Table principale | `YINDEXAPI` | `YLAPI` |
| Nom node (API) | `YcapiSfIndex` | `YcapiApiLog` |
| Nom de package (API) | `@flowline/flowline-ycapi` | `@flowline/flowline-ycapi` |
| Tableau des liens | vide | vide |

**Enregistrer**, puis bouton **Validation** du modèle. Une ligne de node binding est créée automatiquement
(aide en ligne GESAWM / GESANODEB).

## Étape 4 : node bindings

Menu : **Développement > Dictionnaire données > API > Node bindings**, ouvrir la liaison créée pour chaque
modèle (même écran que API_STOPRELIS).

1. Vérifier : Type = Modèle de données ; Table principale ; Nom de node ; **Publié = Oui** ;
   Nom du package = `@flowline/flowline-ycapi`.
2. Onglet Paramètres propriété : chaque propriété de l'étape 2 doit apparaître avec son Binding (code champ).
3. Bloc Sécurité (fonction, site, code d'accès) : la documentation lue ne le détaille pas. Exemple Sage
   observé (API_STOPRELIS) : Fonction = la fonction de gestion X3 de la table (GESPRH). Pour le Log API,
   mettre la fonction de consultation du Log API : ouvrez-la dans X3, X3 Inspector > CURRENT > Screen
   donne son code.
4. Ne créer **aucune opération** (Opérations, GESAPIOPE) : le node reste en lecture seule.
5. Bouton **Validation** (en haut à droite).

## Étape 5 : générer le package (Developer Studio)

Source : guide X3 Builder « Test a standard query with your custom fields » et aide en ligne « Sage X3
Services developer studio installation ».

1. Installer le Developer Studio : Visual Studio Code (édition système), Node.js via nvm à la version du
   fichier `.nvmrc`, puis dans le dossier du studio `npm run clean:install:win`.
2. Renseigner `xtrem-config.yml` : **connexion à la base X3** (driver, serveur, port, identifiants), dossier
   (ex. `PREPROD`), dossier de référence (`X3`), langue, clé secrète X3 Services (paramètres globaux).
3. À la racine du studio : `npm run generate` (crée `application/<package>` depuis le dictionnaire), puis
   dans ce dossier `npm run build`.

**Limite X3 Cloud** : le studio exige une connexion directe à la base X3, qui n'existe pas sur X3 Cloud.
Cette étape se fait donc sur un environnement on-premise ayant le même dictionnaire (YINDEXAPI, YLAPI et
les éléments des étapes 1 à 4). La documentation lue ne décrit pas de variante Cloud.

## Étape 5 bis : déployer le ZIP (Syracuse)

Source : aide en ligne « Deploy add-ons ».

Menu : **Administration > Application/Contrat > Syracuse/Collaboration**, fonction Deploy add-ons.

1. Menu Actions > **New add-ons deployment** ; saisir une description.
2. Choisir l'endpoint racine Sage X3, retirer les endpoints non ciblés.
3. **Select file** : le ZIP de l'add-on (construit depuis le projet X3 Builder, ou récupéré d'un autre
   endpoint avec la fonction **Download add-ons**).
4. Actions > Enregistrer, puis **Start add-ons deployment process**, confirmer.
5. Suivre la trace (lien du champ Trace ID), rafraîchir, vérifier **Generation status**.
6. **Redémarrer le service Sage X3 Services** pour appliquer l'add-on. Sur X3 Cloud, ce service est hébergé
   par Sage : la documentation ne décrit pas de redémarrage en libre-service (demande au support Sage).

## Sans déploiement, dès aujourd'hui

Le requêteur SQL de X3 (**GESALQ**) accepte une requête Select : X3 Inspector, CONNECTOR > Logs & index,
fournit les requêtes prêtes à copier sur les vraies colonnes (NUMIDD_0, CLE_0, YDATE_0...).

## Étape 6 : vérifier

1. Explorateur GraphQL du X3 (`/xtrem/explorer/`) :
   ```graphql
   { flowlineYcapi { ycapiSfIndex { query(first: 5) { edges { node { _id salesforceId x3Key tableCode } } } } } }
   ```
2. X3 Inspector : QUERY > **Reload schema**, puis **CONNECTOR > Logs & index**. Les cartes « Index » et
   « Log API » proposent alors la recherche par Id Salesforce / clé X3 et les derniers logs.

## Sécurité

- Lecture seule : aucune opération GESAPIOPE ; pas de collection mutable.
- YLAPI contient des messages et corps de réponse : restreindre l'accès (rôles, bloc Sécurité du binding).

## Sources

- Aide en ligne Sage X3 V12 : [Node bindings (GESANODEB)](https://online-help.sagex3.com/erp/12/en-us/Content/FCT/GESANODEB.htm),
  [Modèles de données (GESAWM)](https://online-help.sagex3.com/erp/12/fr-fr/Content/FCT/GESAWM.htm),
  [Opérations (GESAPIOPE)](https://online-help.sagex3.com/erp/12/en-us/Content/FCT/GESAPIOPE.htm)
- Guide Sage X3 Builder : [Packages](https://developer.sage.com/x3/x3-builder/developing-api/graphql-api/packages/),
  [Add your custom fields and tables](https://developer.sage.com/x3/x3-builder/developing-api/graphql-api/getting-started/custom-fields/),
  [CLOB and BLOB data types](https://developer.sage.com/x3/x3-builder/developing-api/graphql-api/clob-blob/)
  (version texte : ajouter `.md` à l'URL du portail docs)
- Aide en ligne : [Deploy add-ons](https://online-help.sagex3.com/erp/12/en-us/Content/V7DEV/administration-reference_deploy-add-ons.html),
  [Developer studio installation](https://online-help.sagex3.com/erp/12/en-us/Content/V7DEV/getting-started_Sage-X3-Services-dev-studio-installation.htm),
  [Requêteur SQL (GESALQ)](https://online-help.sagex3.com/erp/12/fr-fr/Content/FCT/GESALQ.htm)
- Sage Community Hub : [X3 GraphQL Extensibility](https://communityhub.sage.com/za/sage-x3/b/sage-x3-support-insights-ame/posts/x3-graphql-extensibility)
- Vos captures PREPROD du 2026-10-02 (Downloads\X3 inspector) : package X6FLS, API_CONTACT_6, API_STOPRELIS, colonnes YINDEXAPI / YLAPI.
