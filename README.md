# X3 Inspector

Assistant de diagnostic Sage X3 V12 dans un Side Panel Chrome, inspiré de Salesforce Inspector :
de l'écran fonctionnel X3 au champ technique, à la table, à la donnée, aux relations et au SQL,
sans quitter la page. **Lecture seule.**

```
apps/extension    Extension Chrome MV3 (Vite, React, CodeMirror 6)
apps/companion    Service local Node.js : métadonnées, validation et exécution SQL lecture seule
packages/shared   Contrat API et types (provenance, confiance, métadonnées)
packages/x3-core  Logique pure testée : validation SQL, conventions X3, MetadataProvider, règles de page
docs/             architecture, métadonnées X3, sécurité, roadmap
```

## Démarrage rapide

Prérequis : Node.js 22 ou plus, Chrome 116 ou plus.

```bash
npm install
npm test                          # tests unitaires (x3-core + companion)
npm run typecheck

# Companion
cp apps/companion/config/companion.config.example.json apps/companion/config/companion.config.json
cp apps/companion/.env.example apps/companion/.env
npm run companion                 # affiche le jeton d'appairage au premier démarrage

# Extension
npm run build                     # produit apps/extension/dist
```

Puis dans Chrome : `chrome://extensions` > mode développeur > "Charger l'extension non empaquetée" >
`apps/extension/dist`. Dans le Side Panel : TOOLS > Settings, créer l'environnement (URL X3, dossier,
URL du Companion, id d'environnement Companion), coller le jeton, autoriser l'accès au site X3.

Détails : `apps/companion/README.md`, `apps/extension/README.md`.

## Principes

- Une information manquante vaut mieux qu'une information fausse : chaque valeur affiche sa source
  et sa confiance (`EXACT`, `METADATA`, `INFERRED`, `UNKNOWN`).
- Aucun identifiant de base dans l'extension ni dans Git. Aucun SQL destructif. PROD signalée en rouge.
- Pas de liste de tables codée en dur : catalogue SQL + dictionnaire X3 via un mapping sondé.

## État

MVP 1. Ce qui est vérifié et ce qui reste à valider sur un vrai environnement X3 : `docs/roadmap.md`
et `docs/x3-metadata.md`.
