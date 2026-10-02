# X3 Inspector Companion

Service local Node.js qui fait le lien entre l'extension Chrome et la base Sage X3, **en lecture seule**.
Il écoute sur `127.0.0.1` uniquement et exige un jeton d'appairage.

## Démarrage

```bash
# depuis la racine du dépôt
npm install
cp apps/companion/config/companion.config.example.json apps/companion/config/companion.config.json
cp apps/companion/.env.example apps/companion/.env      # mots de passe (passwordEnv)
npm run companion
```

Au premier démarrage, le jeton d'appairage est créé dans `config/.companion-token` et affiché dans la
console. Le coller dans l'extension : TOOLS > Settings. Pour le réafficher :
`npm run companion -- --show-token`.

Variable `X3I_CONFIG` : chemin d'un autre fichier de configuration.

## Environnements

Trois façons de décrire un environnement (voir `config/companion.config.example.json`) :

| Mode | Clés | Mot de passe |
|---|---|---|
| Base directe | `database: { type, host, port/instance, database/service, schema, user, passwordEnv }` | variable d'environnement nommée par `passwordEnv`, dans `apps/companion/.env` |
| Profil x3-connect | `x3ConnectProfile: "<projet>/.x3/<profil>.env"` | lu dans le profil (jamais copié ailleurs) |
| Hors ligne | `metadata: { provider: "x3-context", path: "<projet>/x3-context/<profil>" }` | aucun ; SQL désactivé |

`schema` = code du dossier X3. `language` (défaut `FRA`) pilote les libellés. `dictionaryMapping`
permet de corriger le mapping du dictionnaire X3 sans recompiler (voir `docs/x3-metadata.md`).

Compte SQL : **lecture seule** (SQL Server : `db_datareader`). `/status` signale un compte
`db_owner` ou `db_datawriter`.

## API

Contrat typé : `packages/shared/src/api.ts`. Toutes les routes sauf `/health` demandent
`Authorization: Bearer <jeton>` et `X-X3I-Env: <id>`.

```bash
TOKEN=$(cat apps/companion/config/.companion-token)
curl -H "Authorization: Bearer $TOKEN" -H "X-X3I-Env: client-preprod" "http://127.0.0.1:8642/metadata/tables?q=BPC"
```

| Route | Rôle |
|---|---|
| `GET /health` | état ; environnements si authentifié |
| `GET /environments`, `GET /status` | environnements ; état détaillé (connexion, droits, sonde du dictionnaire) |
| `GET /metadata/tables?q=`, `/metadata/tables/:t`, `/fields`, `/relations` | tables, champs, relations |
| `GET /metadata/search?q=`, `/metadata/fields/:f/usage`, `/metadata/local-menus/:n` | recherche, usages, menus locaux |
| `GET /metadata/dictionary/status`, `POST /metadata/refresh` | sonde du dictionnaire, vidage du cache |
| `POST /metadata/resolve-page` | fonction / objet -> table principale |
| `POST /query/validate`, `POST /query`, `POST /record` | validation, exécution SELECT, lecture d'un enregistrement |

## Sécurité (résumé, détail dans `docs/security.md`)

- Contrôles dans l'ordre : en-tête Host (anti DNS rebinding), Origin (`chrome-extension://` seulement),
  jeton, taille du corps.
- SQL : validation par tokenizer, qualification des tables, transaction toujours annulée (SQL Server)
  ou `SET TRANSACTION READ ONLY` (Oracle), limite de lignes, délai maximal.
- Logs : texte SQL journalisé (désactivable avec `security.logSql: false`), jamais les lignes ni les secrets.

## Tests

```bash
npx vitest run apps/companion
```

Les tests utilisent des données synthétiques (`test/fixtures`) et une fausse connexion : aucune
base n'est nécessaire. **Non testé à ce jour : connexion réelle SQL Server / Oracle.**
