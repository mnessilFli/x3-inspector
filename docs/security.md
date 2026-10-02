# Sécurité

X3 Inspector touche des bases ERP clients, y compris en production. Le MVP est **strictement en
lecture seule** et ne modifie jamais Sage X3.

## 1. Modèle de menace

| Menace | Contre-mesure |
|---|---|
| Fuite des identifiants de base | jamais dans l'extension ni dans Git ; uniquement côté Companion (variable d'environnement ou profil x3-connect hors dépôt) |
| Requête destructrice (volontaire, erreur, copier-coller) | validateur par tokenizer + transaction annulée / `READ ONLY` + compte SQL lecture seule |
| Site web malveillant appelant `http://127.0.0.1:<port>` | jeton d'appairage obligatoire, CORS limité à `chrome-extension://`, en-tête personnalisé imposant un preflight |
| Autre processus local | jeton d'appairage (fichier local, non versionné) ; écoute sur `127.0.0.1` uniquement |
| Requête trop lourde sur la prod | limite de lignes (défaut 500, plafond configurable), délai maximal, lecture sans verrou partagé (SQL Server, `READ UNCOMMITTED`, configurable) |
| Confusion d'environnement | bandeau `PROD · READ ONLY` rouge permanent, type d'env affiché partout, env transmis explicitement à chaque appel |
| Données personnelles dans les logs | les lignes de résultat ne sont jamais journalisées ; le texte SQL l'est (désactivable) |
| Secrets dans le stockage de l'extension | favoris et historique ne contiennent que du SQL ; le jeton d'appairage est stocké à part dans `chrome.storage.local` (jamais `sync`) |

## 2. Validation SQL lecture seule

Implémentation : `packages/x3-core/src/sql/readOnly.ts`, testée par
`packages/x3-core/test/readOnly.test.ts`.

1. **Tokenizer** : commentaires `--` et `/* */` (imbriqués, comme SQL Server), chaînes `'...'`
   avec `''`, `N'...'`, `q'[...]'` Oracle, identifiants `"..."` et `[...]`, nombres, mots,
   ponctuation. Un commentaire ou une chaîne non fermés rendent la requête invalide.
2. **Une seule instruction** : un `;` n'est toléré qu'en toute fin.
3. **Premier mot-clé** : `SELECT` ou `WITH`. Après `WITH`, l'instruction principale doit être un
   `SELECT` (pas de `WITH ... DELETE` ni `WITH ... MERGE`).
4. **Mots-clés interdits n'importe où** (hors chaînes, commentaires et identifiants délimités) :
   `INSERT UPDATE DELETE MERGE UPSERT DROP ALTER CREATE TRUNCATE RENAME EXEC EXECUTE CALL GRANT
   REVOKE DENY INTO BACKUP RESTORE BULK OPENROWSET OPENQUERY OPENDATASOURCE OPENXML SHUTDOWN DBCC
   KILL CHECKPOINT RECONFIGURE SETUSER REVERT BEGIN DECLARE SET COMMIT ROLLBACK SAVEPOINT LOCK
   WAITFOR USE UPDATETEXT WRITETEXT COMMENT ANALYZE PURGE FLASHBACK AUDIT NOAUDIT NEXTVAL`
   (liste de référence : `FORBIDDEN_KEYWORDS` dans `readOnly.ts`).
   `INTO` est interdit car `SELECT ... INTO` crée une table. `REPLACE` reste autorisé : c'est
   aussi une fonction de chaîne courante dans les deux dialectes.
   Aucune exemption après un point : T-SQL accepte `a. DELETE`, et aucun nom de colonne X3 n'est
   un de ces mots-clés.
7. **Dialecte** : le lexer dépend du dialecte (commentaires imbriqués en SQL Server seulement,
   `q'[...]'` en Oracle seulement). Sans dialecte connu, la requête est validée sous les deux et
   doit passer les deux : sinon une construction lue comme chaîne par un dialecte pourrait cacher
   une instruction exécutée par l'autre (cas testés).
5. **Clauses de verrouillage et séquences** : `FOR UPDATE` (Oracle), indices de table
   `UPDLOCK XLOCK TABLOCK TABLOCKX HOLDLOCK PAGLOCK`, `NEXT VALUE FOR` et `.NEXTVAL` interdits.
6. **Procédures** : tout identifiant commençant par `xp_`, `sp_`, `dbms_` ou `utl_` est refusé.
   Limite connue : une fonction PL/SQL spécifique appelée dans un SELECT peut, si elle est
   déclarée en transaction autonome, écrire malgré `READ ONLY`. Seul un compte sans droit
   d'écriture ni d'exécution l'empêche.

Le validateur est **la deuxième ligne de défense**. La première est un compte SQL sans droit
d'écriture (SQL Server : `db_datareader` uniquement ; Oracle : `SELECT` sur le schéma du dossier).
`/health` signale un compte membre de `db_owner` ou `db_datawriter` (SQL Server).

## 3. Exécution

- SQL Server : `BEGIN TRANSACTION` -> `SET ROWCOUNT <max+1>` -> requête -> `ROLLBACK` systématique.
- Oracle : `SET TRANSACTION READ ONLY` -> requête avec `maxRows = max+1` -> `ROLLBACK`.
- Délai maximal par requête (`queryTimeoutMs`, défaut 30 s).
- `/record` construit une requête **paramétrée** ; table et colonnes sont vérifiées contre le
  catalogue avant d'être insérées comme identifiants délimités.

## 4. Companion

- Écoute `127.0.0.1` (configurable, refus explicite de `0.0.0.0` sauf `allowRemote: true`).
- Jeton d'appairage aléatoire (32 octets) créé au premier démarrage dans
  `apps/companion/config/.companion-token` (ignoré par Git), affiché dans la console.
  L'utilisateur le colle dans TOOLS > Settings.
- Comparaison du jeton en temps constant.
- CORS : seules les origines `chrome-extension://<id>` sont acceptées (liste d'ID configurable).
- TLS optionnel (`server.tls.certFile/keyFile`).

## 5. Git

`.gitignore` exclut : `apps/companion/config/companion.config.json`, `apps/companion/.env`,
`apps/companion/config/.companion-token`, `.x3/`, `logs/`, `*.pem`, `*.key`. Seul
`companion.config.example.json` (sans secret) est versionné.

## 6. Ce que le MVP ne fait pas

Aucune écriture en base, aucun appel GraphQL en mutation, aucune modification de X3, aucun envoi
de données à un service externe, aucune télémétrie.
