# Métadonnées Sage X3 : ce qui est vérifié, ce qui ne l'est pas

Règle du projet : **ne jamais supposer qu'une table ou une colonne existe.** Ce document sépare
explicitement les sources vérifiées des hypothèses, et décrit comment le Companion valide les
hypothèses sur chaque environnement.

## 1. État des connaissances (2026-10-02)

| Élément | Statut | Source |
|---|---|---|
| Catalogue SQL Server : `INFORMATION_SCHEMA.TABLES/COLUMNS`, `sys.tables/indexes/index_columns/columns/schemas/partitions` | Vérifié (catalogue standard SQL Server) | documentation SQL Server ; requêtes reprises du skill x3-connect |
| Catalogue Oracle : `ALL_TABLES`, `ALL_TAB_COLUMNS`, `ALL_INDEXES`, `ALL_IND_COLUMNS` | Vérifié (dictionnaire standard Oracle) | idem |
| Schéma SQL = code du dossier X3 | Pratique établie, utilisée par x3-connect | skill x3-connect (`X3_SQL_SCHEMA`, "Endpoint details > Server folder") |
| Colonnes physiques suffixées `_<n>` (`BPCNUM_0`, champs dimensionnés `_0.._n`) | Convention connue, **non vérifiée sur un environnement dans ce projet** | skill x3-connect (SKILL.md) ; traitée comme `INFERRED` |
| Index nommés `<TABLE>_<CODEINDEX>` et index `<ABR>0` = clé | Convention connue, **non vérifiée ici** | traitée comme `INFERRED` |
| `ATABZON` possède les colonnes `LIEN` et `ANNUL` | Lu dans du code L4G client | skill connecteur-dhm-fli (`YCAPIANUCOD:24-49`, filtre `LIEN=FICANU and ANNUL=1`) |
| Noms et colonnes des autres tables du dictionnaire | **Non vérifié** | connaissances générales, liste candidate du skill x3-connect |
| URL Syracuse : `/syracuse-main/`, `/trans/x3/erp/<SEGMENT>/`, `f=<FONCTION>` (encodé deux fois) | Vérifié sur X3 Cloud V12 (`*.em.cloud-by-sage.fr`, GESBPC, segment `PREPROD`) le 2026-10-02 | URL fournie par l'utilisateur, test `packages/x3-core/test/realUrl.test.ts` |
| DOM Syracuse : `#s_app[data-s-endpoint/data-s-role/data-s-local]`, `h1.s_page_header_title`, `[id^=layout-slot-]` avec classe `s-field-type-x-*`, `.s-field-value-edit.s-mandatory`, `input.s-field-input[maxlength]` | Vérifié sur la même page | instantanés DOM fournis par l'utilisateur (4 éléments) |
| Le nom technique du champ (BPCNUM) est dans les attributs HTML | **Faux** : absent des attributs de l'input et de ses 10 parents (ids internes `1-113-input`) | mêmes instantanés |

Le skill x3-connect liste comme candidates (non validées) : `ATABLE, ATABZON, ATABIND, ATYPE,
AMASK, AMSKZON, AWINDOW, AOBJET, AFONCTION, ACTIV, APLSTD, ATEXTE`. Ce projet ajoute
`ATEXTRA` (textes traduisibles) comme candidate.

## 2. Couche 1 : catalogue SQL (toujours disponible)

Fournit avec confiance `EXACT` : nom des tables, nombre de lignes (SQL Server : `sys.partitions` ;
Oracle : `NUM_ROWS`, statistique), colonnes, type SQL, longueur, précision, nullabilité, index,
unicité, colonnes d'index.

Requêtes : `apps/companion/src/sources/sql/catalogQueries.ts`. Elles sont paramétrées par le
schéma et n'utilisent aucune table X3.

## 3. Couche 2 : conventions X3 appliquées au catalogue (`INFERRED`)

Implémentées dans `packages/x3-core/src/metadata/conventions.ts`, chacune testée et désactivable.

| Convention | Effet | Exemple |
|---|---|---|
| `CHAMP_<n>` | regroupe les colonnes en un champ X3 de dimension n+1 | `BPCNUM_0` -> champ `BPCNUM`, dim 1 |
| Index `<TABLE>_<ABR><n>` | déduit l'abréviation de la table | `BPCUSTOMER_BPC0` -> `BPC` |
| Index unique `<ABR>0` | déduit la clé primaire | colonnes de `BPCUSTOMER_BPC0` |
| Colonnes techniques | marque `UPDTICK`, `CREDATTIM`, `UPDDATTIM`, `AUUID`, `ROWID`, `CREUSR`, `UPDUSR`, `CREDAT`, `UPDDAT` comme techniques | liste configurable |
| Préfixe `X`, `Y`, `Z` | marque table ou champ "custom suspected" | `ZIDSF_OPP` |

Le préfixe n'est **jamais** une preuve : il donne `custom-suspected` (`INFERRED`). Seul un code
activité spécifique lu dans le dictionnaire (si le mapping est résolu) peut confirmer.

## 4. Couche 3 : dictionnaire X3 via mapping sondé (`METADATA`)

### 4.1 Principe

Le mapping (`packages/x3-core/src/metadata/dictionary/defaultMapping.ts`) décrit, pour chaque
information logique, une table candidate et des **colonnes candidates** (plusieurs alternatives
possibles). Exemple :

```ts
fields: {
  table: 'ATABZON',
  columns: {
    table:      ['CODFIC'],
    field:      ['CODZONE'],
    x3Type:     ['CODTYP'],
    length:     ['LONZONE'],
    dimension:  ['DIME'],
    activity:   ['CODACT'],
  },
}
```

### 4.2 Sonde

Au premier appel (puis en cache), le Companion :

1. vérifie dans le **catalogue SQL** que la table candidate existe dans le schéma ;
2. pour chaque colonne logique, cherche la première colonne candidate existante, avec ou sans
   suffixe `_0` (`CODFIC_0` ou `CODFIC`) ;
3. marque chaque bloc `usable` si ses colonnes obligatoires sont résolues ;
4. expose le résultat sur `GET /metadata/dictionary/status`, avec **la liste réelle des colonnes**
   de chaque table candidate.

Un bloc non résolu désactive la fonctionnalité correspondante, affichée `Unknown (dictionary
mapping not resolved: ATABZON.CODZONE)`. Rien n'est deviné.

### 4.3 Surcharge sans recompiler

Dans `companion.config.json`, par environnement :

```json
"dictionaryMapping": {
  "fields": { "columns": { "label": ["INTITZON"] } },
  "localMenus": { "table": "APLSTD", "columns": { "menu": ["LANCHP"] } }
}
```

La surcharge est fusionnée avec le mapping par défaut.

### 4.4 Mapping candidat par défaut (hypothèses à valider)

**Toutes les lignes ci-dessous sont des hypothèses.** Elles proviennent de connaissances générales
sur X3 et doivent être confirmées par la sonde sur un vrai dossier. La colonne "Sémantique"
indique aussi les hypothèses de sens (une colonne peut exister et ne pas signifier ce qu'on croit).

| Bloc | Table | Colonnes logiques -> candidates | Sémantique à confirmer |
|---|---|---|---|
| tables | `ATABLE` | table `CODFIC`, abréviation `ABRFIC`, description `INTITFIC`, activité `CODACT`, module `MODULE` | `INTITFIC` peut être un texte direct ou une référence de traduction |
| fields | `ATABZON` | table `CODFIC`, champ `CODZONE`, type `CODTYP`, longueur `LONZONE`, dimension `DIME`, libellé `INTITZON`, menu local `MENLOC`, activité `CODACT`, ordre `NOLIGNE` | colonne du menu local et du libellé incertaines |
| indexes | `ATABIND` | table `CODFIC`, code `CODIND`, description `DESCRIPT`, doublons `HOMONYM` | formule de clé dans `DESCRIPT` à confirmer |
| types | `ATYPE` | type `CODTYP`, table liée `FICHIER` | sert à déduire les liens type -> table |
| localMenus | `APLSTD` | menu `LANCHP`, valeur `LANNUM`, langue `LAN`, libellé `LANMES` | |
| screens | `AMASK` | écran `CODMSK`, abréviation `ABRMSK` | |
| screenFields | `AMSKZON` | écran `CODMSK`, champ `CODZONE` | |
| objects | `AOBJET` | objet `CODOBJ`, table principale `NOMFIC`, fenêtre `FENETRE` | |
| functions | `AFONCTION` | fonction `CODINT`, objet `OBJET` | |
| windows | `AWINDOW` | fenêtre `CODWIN` | |
| translations | `ATEXTRA` | table `CODFIC`, zone `ZONE`, langue `LANGUE`, clé 1 `IDENT1`, clé 2 `IDENT2`, texte `TEXTE` | résolution des libellés traduits |

### 4.5 Relations

Ordre de priorité :

1. **Dictionnaire** (`METADATA`) : un champ de la table dont le type (`ATABZON.CODTYP`) pointe vers
   une table (`ATYPE.FICHIER`) donne une relation vers la clé de cette table. Activé seulement si
   les blocs `fields` et `types` sont résolus. Source affichée : `X3 dictionary (type -> table)`.
2. **Inférence** (`INFERRED`) : une colonne `X_0` égale à la clé primaire mono-colonne inférée d'une
   autre table. Source affichée : `Inferred - verification required`.
3. **Base de connaissance** (V2) : relations validées par l'utilisateur.

Jamais de relation métier codée en dur (commandes d'un client, adresses...).

### 4.6 Libellés et langue

La langue (`FRA`, `ENG`...) est un paramètre d'environnement (`language`). Les libellés viennent
d'abord de `ATEXTRA` si résolu, sinon de la colonne directe si elle contient du texte. Sinon
`Unknown`.

## 5. Mode hors ligne : fichiers x3-context

Le skill x3-connect produit `x3-context/<profil>/sql/` :

- `tables.csv` (`TABLE_NAME, ROW_COUNT`), `columns.csv`, `indexes.csv` : catalogue ;
- `dictionary/<TABLE>.csv` : contenu brut des tables du dictionnaire présentes.

Le `StaticMetadataProvider` lit ces fichiers avec le même service et la même sonde (les en-têtes CSV
donnent les colonnes réelles). Utile sans VPN ; l'exécution SQL est alors indisponible.

## 6. Procédure de validation sur le premier vrai environnement

1. Configurer l'environnement dans le Companion, démarrer, ouvrir TOOLS > Dictionary status.
2. Pour chaque bloc non `usable`, lire les colonnes réelles affichées et corriger
   `dictionaryMapping` dans la config.
3. Vérifier le sens sur un cas connu : `BPCUSTOMER` doit avoir l'abréviation `BPC`, le champ
   `BPCNUM`, un libellé lisible ; un menu local connu doit afficher ses libellés.
4. Reporter le mapping validé dans `defaultMapping.ts` en passant son statut de `hypothesis` à
   `verified` avec la version X3 et la date, et mettre à jour la section 1 de ce document.
5. Calibrer la détection DOM : TOOLS > DOM Debug, copier l'instantané d'un champ connu et ajuster
   les règles (`x3-core/page/rules.ts`).

## 7. X3 Cloud : ce qui a été vérifié sur un vrai environnement (2026-10-02)

Environnement : X3 Cloud V12, `snouestboissons.em.cloud-by-sage.fr`, endpoint Pré-Prod, fonction GESBPC.
Sources : URL, instantanés DOM, réponse `/me`, capture HAR nettoyée `captures/gesbpc.har`, export du schéma
GraphQL `captures/x3-graphql-schema.json` (fichiers locaux, hors Git : ils contiennent des données client).

| Fait | Source |
|---|---|
| Pas d'accès SQL direct sur X3 Cloud : seule source de données = l'application elle-même | contexte Cloud, confirmé par l'utilisateur |
| GraphQL appelable avec la session du navigateur : `POST /xtrem/explorer/`, JSON `{query}`, cookie de session, sans en-tête `x-xtrem-endpoint` | onglet Réseau de l'explorateur GraphiQL ; export du schéma réussi depuis l'extension |
| 30 packages GraphQL, 696 nœuds lisibles, 12 567 propriétés ; aucun nœud « table / champ / écran / menu local » | `x3-graphql-schema.json` |
| 90 % des propriétés GraphQL portent le code champ X3 dans leur description : `customer.code` = « Code (BPCNUM) » | idem |
| Segment d'URL `/trans/x3/erp/<X>/` = dataset de l'endpoint, pas toujours le dossier (Recette : dataset RECETTE, dossier REC) | réponse `/me` |
| Description d'écran : `GET /sdata/syracuse/collaboration/syracuse/pages('x3.erp.<DATASET>.<FENETRE>.$fusion,trans,')` : `$prototype.$properties.<xid>` avec `$X3Name` (`BPC0_BPCNUM`), `$type`, `$maxLength`, `$mnu`, `$title` + `$localization` | HAR, fenêtre OBPC, 306 champs |
| Ouverture de fonction : `POST /trans/x3/erp/<DATASET>/$sessions?f=GESBPC/...` : `sap.func.open.B.name = OBPC` | HAR |
| Entrée dans un champ : `PUT .../$sessions('<id>')/requestSvc?act=1044`, corps `param.target = {win, xid}` (champ entré), `fld.ist` (champ quitté) | HAR : AA4 = BPC0_BPCNUM, BA3 = BPRBPC_BPRNAM_1 |
| Libellé + type + longueur ne suffisent pas à identifier un champ (3 champs « Langue » identiques) | rejeu du HAR |

Mise en œuvre : `packages/x3-core/src/syracuse/protocol.ts` (analyseurs testés), `apps/extension/src/hook/index.ts`
(écoute en lecture seule de `fetch` dans la page), `apps/extension/src/content/syracuseState.ts`. Aucun de ces
échanges n'est une API documentée par Sage : les analyseurs renvoient « inconnu » si la forme change.
