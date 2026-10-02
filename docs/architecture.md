# X3 Inspector : architecture

Statut : MVP 1. Date : 2026-10-02.

## 1. Objectif et parcours directeur

X3 Inspector est un assistant de diagnostic Sage X3 V12 intégré à Chrome (Side Panel), inspiré de
Salesforce Inspector. Toutes les décisions techniques servent un seul parcours :

```
écran fonctionnel X3 -> champ technique -> table -> donnée -> relations -> SQL
        (DOM)            (DOM + métadonnées)    (SQL lecture seule)   (dictionnaire / inférence)
```

Principe transversal : **une information manquante vaut mieux qu'une information fausse.** Chaque
information détectée porte une provenance et un niveau de confiance (section 6).

## 2. Vue d'ensemble

```
┌──────────────────────────────┐
│ Onglet Sage X3 (Syracuse)    │  content script : X3PageAdapter
│  DOM, URL, titre, champs     │  (détection, MutationObserver, mode Inspect, debug DOM)
└──────────────┬───────────────┘
               │ chrome.runtime / chrome.tabs messages
┌──────────────▼───────────────┐
│ Extension Chrome (MV3)       │  service worker : side panel, raccourcis, injection
│  Side Panel React            │  side panel : CURRENT / DATA / SQL / METADATA / TOOLS
└──────────────┬───────────────┘
               │ HTTP 127.0.0.1 + jeton d'appairage (Bearer)
┌──────────────▼───────────────┐
│ X3 Inspector Companion       │  Node.js + TypeScript
│  API REST, validation SQL,   │  X3MetadataProvider, X3QueryProvider,
│  métadonnées, cache, logs    │  X3ConnectionProvider (mssql / oracle)
└──────────────┬───────────────┘
               │ compte SQL lecture seule
┌──────────────▼───────────────┐
│ Base Sage X3                 │  SQL Server ou Oracle, schéma = code dossier
└──────────────────────────────┘
```

Aucun identifiant de base ne transite par l'extension. L'extension ne connaît que l'URL du
Companion et un jeton d'appairage local (voir `security.md`).

## 3. Monorepo

npm workspaces, TypeScript partout.

```
x3-inspector/
  docs/                    architecture, métadonnées X3, sécurité, roadmap
  packages/
    shared/                types du contrat API (DTO), confiance, environnements. Aucune logique.
    x3-core/               logique pure, testée, sans I/O :
      sql/                 tokenizer, validateur lecture seule, qualification des tables,
                           contexte d'autocomplétion, génération SQL, littéraux
      metadata/            interfaces providers, service de métadonnées sur sources abstraites,
                           parsing des colonnes X3 (CHAMP_0), classement standard/spécifique,
                           inférence des clés et relations, mapping du dictionnaire
      page/                interface X3PageAdapter, règles de détection URL/titre
      x3/                  syntaxes [F:ABR]CHAMP, [M:ECRAN]CHAMP
      export/              CSV / JSON
  apps/
    companion/             serveur HTTP Node, adapters SQL Server / Oracle, sources catalogue
                           et dictionnaire (SQL ou fichiers x3-context), config, auth, logs
    extension/             Vite + React + MV3 : background, content script, side panel
```

Les packages exposent directement leurs sources TypeScript (`exports: ./src/index.ts`) : pas
d'étape de build intermédiaire, Vite (extension) et tsx (companion) les compilent à la volée.

## 4. Les quatre interfaces d'adaptation

Elles sont définies dans `packages/x3-core` et permettent de changer la manière de récupérer
l'information sans réécrire l'application.

| Interface | Rôle | Implémentations MVP | Plus tard |
|---|---|---|---|
| `X3PageAdapter` | comprendre la page X3 ouverte (contexte, champ cliqué, observation) | `SyracusePageAdapter` (heuristiques DOM + règles URL configurables) | adapter calibré sur le DOM réel, adapter "X3 Builder" |
| `X3MetadataProvider` | tables, champs, index, relations, menus locaux, recherche, usages | `CatalogMetadataProvider` sur deux sources : catalogue SQL + dictionnaire X3 | `X3ApiMetadataProvider` (GraphQL), provider composite multi-env |
| `X3QueryProvider` | exécuter un SELECT validé, borné, en lecture seule | `SqlQueryProvider` | cache de résultats, plan d'exécution |
| `X3ConnectionProvider` | ouvrir une connexion de base | `MssqlConnectionProvider`, `OracleConnectionProvider` | pool partagé multi-env |

### 4.1 Métadonnées : un service, plusieurs sources

```
X3MetadataProvider (interface)
  └─ CatalogMetadataProvider (x3-core, logique pure, testée)
        ├─ CatalogSource      structure physique : tables, colonnes, index
        │     ├─ SqlCatalogSource   INFORMATION_SCHEMA / sys.* (SQL Server), ALL_* (Oracle)
        │     └─ CsvCatalogSource   fichiers x3-context/<profil>/sql/*.csv (skill x3-connect)
        └─ DictSource         dictionnaire X3 (ATABLE, ATABZON, APLSTD...)
              ├─ SqlDictSource      requêtes paramétrées sur les tables du dictionnaire
              └─ CsvDictSource      x3-context/<profil>/sql/dictionary/<TABLE>.csv
```

- `DatabaseMetadataProvider` = `CatalogMetadataProvider` + sources SQL.
- `StaticMetadataProvider` = `CatalogMetadataProvider` + sources CSV (mode hors ligne, sans VPN).
- `X3ApiMetadataProvider` : emplacement prévu, non implémenté.

Le catalogue SQL est une source **vérifiable** sur toute base. Le dictionnaire X3 est une source
**plus riche mais dont la structure n'est pas encore validée** : il passe par un mapping
configurable et une sonde (section 7 et `x3-metadata.md`).

## 5. Extension Chrome

### 5.1 Composants

| Composant | Fichiers | Rôle |
|---|---|---|
| Service worker | `src/background/` | `sidePanel.setPanelBehavior`, commandes clavier, enregistrement dynamique du content script sur les origines X3 autorisées, relais de messages |
| Content script | `src/content/` | `SyracusePageAdapter` : contexte de page, MutationObserver, mode Inspect (survol encadré, clic capturé), instantané DOM pour le debug |
| Side panel | `src/sidepanel/` | UI React découpée par fonctionnalité (`features/current`, `features/data`, `features/sql`, `features/metadata`, `features/tools`) |
| Lib | `src/lib/` | client Companion, stockage `chrome.storage.local`, messages typés, export, presse-papiers |

### 5.2 Navigation

```
CURRENT   Screen (fonction / écran / table détectés) · Field (champ inspecté) · Record
DATA      Table Explorer · Record Inspector
SQL       Query (éditeur, historique, favoris)
METADATA  Search (recherche universelle) · Fields (Field Explorer + usages)
TOOLS     Settings (environnements, appairage) · DOM Debug · Dictionary status
```

### 5.3 Permissions

- `sidePanel`, `storage`, `scripting`.
- `host_permissions` : `http://127.0.0.1/*`, `http://localhost/*` (Companion).
- `optional_host_permissions` : `*://*/*`. L'accès à une instance X3 est demandé explicitement
  (`chrome.permissions.request`) quand l'utilisateur enregistre un environnement. Pas de
  permission `tabs` : l'extension ne lit pas l'historique de navigation.

### 5.4 Éditeur SQL : CodeMirror 6 plutôt que Monaco (décision)

Monaco est pensé pour un éditeur plein écran, pèse plusieurs Mo et impose une configuration de
workers sous MV3. CodeMirror 6 est modulaire, léger, sans worker, adapté à un side panel étroit, et
fournit tout ce qui est demandé : coloration SQL (dialectes MSSQL et PL/SQL), autocomplétion
pilotée par une source asynchrone (le Companion), infobulles au survol, raccourcis. Le formatage
est assuré par `sql-formatter` (dialectes `transactsql` et `plsql`).

### 5.5 Détection et inspection de la page X3

Le DOM de Syracuse n'a pas encore été observé sur un environnement réel pendant la conception.
L'adapter est donc construit pour **apprendre** :

1. **Règles de détection déclaratives** (`x3-core/page/rules.ts`) : expressions régulières sur URL
   et titre avec groupes nommés (`folder`, `function`...). Les règles par défaut sont des
   hypothèses (confiance `INFERRED`) ; l'utilisateur peut en ajouter ou les marquer vérifiées.
2. **Candidats de nom technique** : au clic sur un élément, on collecte les attributs de l'élément
   et de ses ancêtres (id, name, data-*, aria-*, classes) et on extrait les jetons qui ressemblent
   à un code X3. Un candidat ne devient `METADATA` que s'il est confirmé par les métadonnées
   (champ existant dans la table ou l'écran courant).
3. **Libellé et valeur** : `aria-label`, `<label for>`, texte voisin ; valeur affichée de
   l'input / select / texte. La valeur affichée peut être formatée (date, nombre, libellé de menu
   local) : le panneau le signale.
4. **Mode DEBUG** : instantané de l'élément (balise, attributs, hiérarchie des parents, candidats,
   confiance) copiable en JSON pour calibrer les règles sur le DOM réel.
5. **Surcharge manuelle** : chaque information du contexte (dossier, fonction, table...) peut être
   saisie ou corrigée à la main dans CURRENT ; elle est alors marquée `EXACT / manual`.

Observation : `MutationObserver` sur le document (débouncé), comparaison d'une signature de
contexte (URL, titre, fonction détectée) et notification du panneau en cas de changement de
fonction ou d'onglet. Injection `allFrames` au cas où Syracuse utiliserait des iframes.

## 6. Provenance et confiance

```ts
type Confidence = 'EXACT' | 'METADATA' | 'INFERRED' | 'UNKNOWN';
interface Provenance { source: SourceKind; confidence: Confidence; detail?: string }
```

| Niveau | Signification | Exemples |
|---|---|---|
| `EXACT` | lu tel quel dans une source sûre | colonne lue dans le catalogue SQL, dossier saisi dans la config, valeur affichée à l'écran |
| `METADATA` | lu dans le dictionnaire X3 via un mapping sondé | libellé ATABZON, menu local APLSTD |
| `INFERRED` | déduit par une règle | abréviation déduite du nom d'index `BPCUSTOMER_BPC0`, fonction déduite de l'URL, relation par correspondance de nom de colonne, préfixe X/Y/Z |
| `UNKNOWN` | non disponible | affiché `Unknown` avec la raison |

L'UI affiche systématiquement la source à côté de l'information (badge).

## 7. Stratégie métadonnées (résumé, détail dans `x3-metadata.md`)

1. Catalogue SQL : tables, colonnes, types, longueurs, index uniques. Vérifié, toujours disponible.
2. Conventions X3 appliquées au catalogue, marquées `INFERRED` : colonnes `CHAMP_<n>` regroupées en
   champ dimensionné, abréviation et clé primaire déduites de l'index `<TABLE>_<ABR>0`.
3. Dictionnaire X3 via mapping : liste de tables et colonnes candidates par information logique.
   Au démarrage, la **sonde** vérifie dans le catalogue quelles tables et colonnes existent
   réellement. Une information dont le mapping n'est pas résolu est `UNKNOWN`, jamais devinée.
   L'écran TOOLS > Dictionary status montre le résultat et les colonnes réelles pour corriger le
   mapping (surcharge dans la config du Companion, sans recompiler).
4. Relations : source dictionnaire si le mapping le permet (`METADATA`), sinon inférence par
   correspondance avec la clé primaire mono-colonne d'une autre table (`INFERRED`, "verification
   required"). Jamais de relation métier codée en dur.

## 8. Companion

- Serveur `node:http` sans framework (surface d'attaque et dépendances réduites), écoute
  `127.0.0.1` uniquement.
- Config `apps/companion/config/companion.config.json` (ignorée par Git) : environnements,
  provider de métadonnées, connexion. Mots de passe hors config : variable d'environnement
  (`passwordEnv`, chargée depuis `apps/companion/.env` ignoré par Git) ou profil x3-connect
  existant (`x3ConnectProfile`).
- API (contrat typé dans `packages/shared/src/api.ts`) :

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | état, version ; détail (env, type de base, schéma, provider, mode) si authentifié |
| GET | `/environments` | environnements configurés (sans secret) |
| GET | `/status` | état d'un environnement : connexion, droits d'écriture, nombre de tables, sonde |
| GET | `/metadata/tables?q=&limit=` | recherche de tables (nom, abréviation, description) |
| GET | `/metadata/tables/:table` | table complète : champs, index, clé, provenance |
| GET | `/metadata/tables/:table/fields` | champs |
| GET | `/metadata/tables/:table/relations` | relations avec provenance |
| GET | `/metadata/search?q=` | recherche universelle : tables, champs, écrans, fonctions |
| GET | `/metadata/fields/:field/usage` | où le champ est utilisé |
| GET | `/metadata/local-menus/:menu` | valeurs d'un menu local |
| GET | `/metadata/dictionary/status` | résultat de la sonde du dictionnaire |
| POST | `/metadata/resolve-page` | fonction / objet détectés -> objet, table principale, abréviation |
| POST | `/metadata/refresh` | vide les caches de métadonnées de l'environnement |
| POST | `/query/validate` | validation lecture seule sans exécution |
| POST | `/query` | exécution d'un SELECT validé, borné |
| POST | `/record` | lecture d'un enregistrement par clé (requête paramétrée) |

Toutes les routes sauf `/health` exigent `Authorization: Bearer <jeton>` et l'en-tête
`X-X3I-Env` (identifiant d'environnement côté Companion).

- Cache mémoire par environnement (catalogue complet, index, sonde), rafraîchissable.
- Logs : niveau configurable, SQL exécuté journalisé (jamais les lignes ni les secrets).

## 9. Exécution SQL

1. Validation lecture seule par tokenizer (commentaires, chaînes, identifiants délimités, CTE,
   sous-requêtes) : une seule instruction, commençant par `SELECT` ou `WITH`, aucun mot-clé
   interdit. Côté extension pour le retour immédiat, côté Companion pour l'autorité.
2. Qualification automatique des tables : `FROM BPCUSTOMER` devient `FROM [SEED].[BPCUSTOMER]`
   si la table existe dans le schéma du dossier. Le SQL réellement exécuté est renvoyé et affiché.
3. Exécution dans une transaction annulée systématiquement (SQL Server) ou
   `SET TRANSACTION READ ONLY` (Oracle), avec limite de lignes (défaut 500, plafond configurable)
   et délai maximal.
4. Défense en profondeur : le compte SQL doit être en lecture seule ; `/health` signale un compte
   disposant de droits d'écriture.

## 10. Environnements

Côté extension : `{ nom, type DEV|TEST|PREPROD|PROD, URL X3, dossier, URL Companion, id env Companion }`.
Côté Companion : la connexion de base de chaque env. Le type PROD affiche un bandeau rouge
`PROD · READ ONLY` permanent. Prévu pour la comparaison d'environnements (V2) : le contrat API
est déjà paramétré par environnement, un comparateur pourra interroger deux envs.

## 11. Extensibilité prévue (non développée)

- `TOOLS` accueillera API / SOAP / REST / GraphQL Explorer, Batch Monitor, Trace Explorer : chaque
  outil est un module `features/tools/<outil>` et, si besoin, un groupe de routes Companion.
- `Ask X3` : interface `X3Assistant` à définir sur les mêmes providers (métadonnées, recherche,
  relations, requête). Aucun LLM intégré au MVP.
- Base de connaissance X3 enrichissable : fichier de relations validées par l'utilisateur, chargé
  par le Companion et marqué `source: knowledge-base`.

## 12. Décisions (ADR courts)

| # | Décision | Raison |
|---|---|---|
| 1 | npm workspaces, packages consommés en source TS | pas de pnpm installé, zéro étape de build interne |
| 2 | CodeMirror 6 au lieu de Monaco | poids, MV3, side panel étroit |
| 3 | `node:http` sans framework | dépendances minimales pour un service manipulant des accès base |
| 4 | Catalogue SQL d'abord, dictionnaire X3 sondé | le catalogue est vérifiable partout ; la structure du dictionnaire ne l'est pas encore |
| 5 | HTTP sur 127.0.0.1 par défaut, TLS optionnel | trafic local, `localhost` est un contexte sécurisé pour Chrome ; TLS activable par certificat |
| 6 | Jeton d'appairage + CORS limité aux origines `chrome-extension://` | empêche un site web ou un autre processus local d'interroger le Companion |
| 7 | Pas de permission `tabs`, accès hôte X3 demandé à la demande | moindre privilège |
| 8 | Qualification des tables côté Companion plutôt que réécriture libre | l'utilisateur écrit `FROM BPCUSTOMER` comme dans X3 ; le SQL exécuté reste visible |
