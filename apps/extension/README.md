# X3 Inspector : extension Chrome

Extension Manifest V3 avec Side Panel (Vite + React + TypeScript). Elle lit la page Sage X3 ouverte
et interroge le Companion local pour les métadonnées et le SQL en lecture seule. Elle ne contient
aucun identifiant de base de données.

## Build

Depuis la racine du monorepo :

```bash
npm install
npm run build -w @x3i/extension      # produit apps/extension/dist/
npm run typecheck -w @x3i/extension
```

`npm run dev -w @x3i/extension` reconstruit le side panel et le service worker à chaque
modification (le content script se reconstruit avec `npm run build`).

Les icônes sont générées par `node scripts/gen-icons.mjs` (déjà présentes dans `public/icons`).

## Charger l'extension

1. Ouvrir `chrome://extensions` (ou `edge://extensions`).
2. Activer le **mode développeur**.
3. **Charger l'extension non empaquetée** et choisir `apps/extension/dist/`.
4. Après chaque build, cliquer sur le bouton de rechargement de l'extension, puis recharger
   l'onglet X3.

Un clic sur l'icône X3 Inspector ouvre le Side Panel.

## Appairage avec le Companion

1. Démarrer le Companion (`npm run companion` à la racine). Il affiche un **jeton d'appairage**
   (fichier `apps/companion/config/.companion-token`).
2. Dans le Side Panel : **TOOLS > Settings > Environments > Add** : nom, type (DEV / TEST /
   PREPROD / PROD), URL X3 (ex. `http://x3server:8124`), dossier, URL du Companion
   (`http://127.0.0.1:8642` par défaut) et identifiant d'environnement côté Companion
   (bouton **Load from companion** pour le choisir dans la liste).
3. **Grant access to ...** : Chrome demande l'autorisation de lire le site X3 (permission
   optionnelle, limitée à cet hôte). Sans elle, l'extension ne peut ni détecter la page ni
   inspecter les champs.
4. **Companion pairing** : coller le jeton, **Save**, puis **Test connection**. Le jeton est
   stocké dans `chrome.storage.local` de ce navigateur uniquement (jamais synchronisé).

Un environnement PROD affiche en permanence le bandeau rouge `🔴 PROD · READ ONLY`.

## Raccourcis

| Raccourci | Action |
|---|---|
| `Alt+X` | ouvrir X3 Inspector |
| `Ctrl+Shift+X` | activer / désactiver le mode Inspect field |
| `Ctrl+Entrée` | exécuter la requête (éditeur SQL) |
| `Ctrl+Espace` | autocomplétion (éditeur SQL) |
| `Échap` | quitter le mode Inspect sur la page X3 |

Chrome peut refuser un raccourci déjà pris : les modifier dans `chrome://extensions/shortcuts`.

## Structure

```
src/
  background/   service worker : side panel, raccourcis, enregistrement du content script
  content/      SyracusePageAdapter (règles URL/titre, MutationObserver), mode Inspect, instantané DOM
  lib/          client Companion, stockage, messages, presse-papiers, cache de métadonnées
  sidepanel/
    state/      SettingsContext (env, Companion), PageContext (page, inspection), NavContext
    components/ UI commune (cartes, badges de confiance, grille, autocomplétion)
    features/   current/ data/ sql/ metadata/ tools/ (un dossier par fonctionnalité)
```

## Limites connues (MVP 1)

- La détection de la page et des champs n'a pas encore été calibrée sur le DOM réel de
  Syracuse : les règles par défaut sont des hypothèses (confiance `INFERRED`). Utiliser
  TOOLS > DOM Debug (Copy JSON) sur un champ connu pour ajuster les règles
  (TOOLS > Settings > Page detection rules).
- L'abréviation d'écran n'est pas lue (la syntaxe `[M:...]` utilise le code écran, marqué
  "verify").
- Le Query Builder, la génération de JOIN et la comparaison d'environnements sont prévus en V1.1 / V2.
