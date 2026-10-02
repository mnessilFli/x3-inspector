# Roadmap

## MVP 1 (en cours)

Légende : **T** = couvert par tests automatisés, **M** = vérifié dans le navigateur contre une maquette
(Companion simulé, page factice), **R** = vérifié sur un vrai X3 (aucun à ce jour).

| # | Fonctionnalité | Statut |
|---|---|---|
| 1 | Extension Chrome Manifest V3 | fait, build OK, M |
| 2 | Side Panel | fait, M (ouverture via l'icône et raccourcis non testés) |
| 3 | Détection page Sage X3 (env configuré + règles URL/titre) | fait, T + M ; règles par défaut = hypothèses |
| 4 | Informations page / fonction courante avec confiance et surcharge manuelle | fait, T + M |
| 5 | Mode Inspect Field (survol, clic, candidats, debug DOM) | fait, M sur page factice ; DOM Syracuse réel inconnu |
| 6 | Companion backend | fait, T (25+ tests) + smoke test réel sur données hors ligne |
| 7 | Connexion DB lecture seule (SQL Server, Oracle) | codé, **jamais testé sur une vraie base** |
| 8 | Table Explorer | fait, T + M |
| 9 | Field Explorer + usages | fait, T + M (usages écrans si dictionnaire résolu) |
| 10 | Record Inspector | fait, T + M |
| 11 | SQL Editor (CodeMirror 6) | fait, M |
| 12 | Autocomplétion tables / champs | fait, T (contexte) + M |
| 13 | Exécution SELECT | fait, T (fausse connexion) |
| 14 | Grille de résultats | fait, M |
| 15 | Export CSV / JSON | fait, T (CSV) + M |

Limites connues du MVP : abréviation d'écran et caractère obligatoire toujours `Unknown` (non
présents dans les métadonnées) ; `[M:...]` utilise le code écran, marqué à vérifier.

Inclus en plus car peu coûteux sur la même base : recherche universelle, menus locaux dans le
Record Inspector, relations avec provenance, historique et favoris, formatage SQL.

## Étape de calibration (prochaine, nécessite un vrai environnement)

1. Sonde du dictionnaire sur un dossier V12 réel, correction du mapping, passage en `verified`.
2. Instantanés DOM Syracuse (GESBPC, une commande, un écran à tableau) pour les règles de détection
   de fonction, d'écran, de champ et de valeur.
3. Vérification des conventions `CHAMP_<n>` et `<TABLE>_<ABR>0`.

## V1.1

- Query Builder graphique (champs, WHERE, AND/OR, ORDER BY, TOP, JOIN).
- Generate JOIN depuis une relation.
- Current record relations ("Explore related data").
- Base de connaissance de relations validées (fichier côté Companion).
- Libellés de menu local dans la grille SQL.

## V2

- Comparaison d'environnements (PREPROD vs PROD) : tables, champs, écrans, spécifiques.
- `X3ApiMetadataProvider` (GraphQL, voir skill x3-connect).
- Outils support : API / SOAP / REST / GraphQL Explorer, Batch Monitor, Trace Explorer,
  Integration Inspector.

## V3

- `Ask X3` : assistant s'appuyant sur les providers (métadonnées, recherche, relations, requête).
