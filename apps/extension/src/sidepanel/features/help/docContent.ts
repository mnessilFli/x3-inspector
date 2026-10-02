/**
 * Help built from the Sage X3 V12 online help (French), read on 2026-10-02. Each section links its
 * source page. Lines marked "observé" come from the X3 Cloud Pré-Prod captures of the same day.
 */
const DOC = 'https://online-help.sagex3.com/erp/12/fr-fr/Content/FCT/';

export interface DocSection {
  title: string;
  lines: string[];
  source: { label: string; url: string };
}

export const STRUCTURE_CHAIN = [
  'Menu',
  '  └ Fonction (GESBPC)',
  '      └ Objet (BPC)',
  '          ├ Table principale + tables liées',
  '          └ Fenêtre (OBPC)',
  '              └ Écrans (BPC0, BPRBPC...)',
  '                  └ Blocs',
  '                      └ Champs (zones)',
].join('\n');

export const STRUCTURE: DocSection[] = [
  {
    title: 'Fonction',
    lines: [
      "Toute fonction est appelée depuis un menu : une fonction doit être référencée dans un menu pour pouvoir être appelée.",
      "Les codes commençant par GES sont générés automatiquement par le superviseur de gestion d'objet (GESBPC pour l'objet BPC).",
      "Un code activité inactif désactive la fonction ; les habilitations s'appliquent par site (création, modification, suppression).",
    ],
    source: { label: 'Fonctions (GESAFC)', url: `${DOC}GESAFC.htm` },
  },
  {
    title: 'Objet',
    lines: [
      "Un objet correspond à la gestion complète des fiches d'une table ou d'un groupe de tables (création, consultation, modification, annulation).",
      "La table principale est le champ « Table liée » ; l'onglet Environnement déclare des tables supplémentaires, ouvertes et fermées automatiquement.",
      "La validation de l'objet génère le traitement WOxxx (xxx = code objet). Des scripts standard, verticaux et spécifiques complètent la gestion.",
    ],
    source: { label: 'Objets (GESAOB)', url: `${DOC}GESAOB.htm` },
  },
  {
    title: 'Fenêtre',
    lines: [
      "Une fenêtre est constituée d'une liste d'écrans, de menus, de boutons bas d'écran et de browsers ; à chaque menu et bouton est associée une action.",
      "Pour un objet, la fenêtre a pour code Oxxx (OBPC pour BPC). Plusieurs fenêtres peuvent servir un même objet (objets à variante).",
    ],
    source: { label: 'Fenêtres (GESAWI)', url: `${DOC}GESAWI.htm` },
  },
  {
    title: 'Écran, blocs, champs',
    lines: [
      "Un écran (masque) est un onglet, ou la partie supérieure d'une fenêtre qui porte plusieurs onglets.",
      "Chaque écran est organisé en blocs ; chaque bloc contient une ou plusieurs zones, saisies, affichées ou invisibles.",
      "Norme pour un objet XXX : écran principal XXX0, onglets XXX1 à XXXn. Pas systématique : sur OBPC, l'onglet Identité est l'écran BPRBPC (observé).",
      "Un champ d'écran n'est pas forcément un champ de la table de l'objet : BPRSHO et LAN de l'écran BPRBPC concernent le tiers (observé).",
    ],
    source: { label: 'Écrans (GESAMK)', url: `${DOC}GESAMK.htm` },
  },
  {
    title: 'Table et champs',
    lines: [
      "Abréviation de table : 1 à 3 caractères commençant par une lettre (BPC). Les tables spécifiques commencent par X, Y ou Z.",
      "Champ dimensionné : un champ X3 répété donne plusieurs colonnes en base (CHAMP_0, CHAMP_1...).",
      "Le type de données fixe le format de saisie et les contrôles (BPCNUM : type BPN, vu avec Échap + F6, observé).",
      "Menu local : stocké en base comme une valeur numérique de 1 à 255, rang d'un intitulé.",
      "Index : liste des champs (recherche, unicité). Liens vers d'autres tables : intégrité référentielle, utilisée par l'annulation et l'import-export.",
      "Code activité : indique si la table doit être créée dans le dossier.",
    ],
    source: { label: 'Tables (GESATB)', url: `${DOC}GESATB.htm` },
  },
];

/** Which X3 tool queries tables and which queries objects (Sage online help GESALQ, GESALH, GESAVW). */
export const QUERY_TOOLS: string[][] = [
  [
    'Requêteur SQL (GESALQ)',
    'des tables (SQL natif)',
    "requête Select, même complexe ; un champ dimensionné CHAMP(i) existe en base sous le nom CHAMP_i ; exemple Sage : Select LOGIN_0, CHEF_2 From AUTILIS Where USR_0 like %1% Order by CREDAT_0 (AUTILIS est une table)",
  ],
  ['Requêteur (GESALH)', 'des tables et leurs champs', "on indique pour chaque champ la table dont il est extrait ; les jointures entre tables sont déduites du dictionnaire, ou saisies dans l'onglet Avancé"],
  ['Vues (GESAVW)', 'des tables (SQL natif)', 'la requête est écrite en SQL de la base ; une vue se lit ensuite comme une table, en lecture seule'],
  ['GraphQL (onglets QUERY et OBJECTS de X3 Inspector)', 'des objets (nodes)', 'un objet comme customer regroupe des champs de plusieurs tables et peut contenir des champs calculés'],
];

export const SQL_HELP: DocSection[] = [
  {
    title: 'Écrire du SQL sur une base X3 (on-premise)',
    lines: [
      "Un champ dimensionné CHAMP(indice) existe en base sous le nom CHAMP_indice : le champ BPCNUM est la colonne BPCNUM_0.",
      "Exemple de la doc Sage : Select LOGIN_0, CHEF_2 From AUTILIS Where USR_0 like %1% Order by CREDAT_0",
      "Un menu local est un nombre en base (1 à 255) : on compare la valeur numérique, pas le libellé affiché.",
      "Onglet SQL de X3 Inspector (avec le Companion) : les tables connues sont préfixées automatiquement par le schéma du dossier.",
    ],
    source: { label: 'Requêteur SQL (GESALQ)', url: `${DOC}GESALQ.htm` },
  },
  {
    title: 'Dans X3 : requêteur et requêteur SQL',
    lines: [
      "Requêteur (GESALH) : les jointures entre tables sont déterminées automatiquement à partir du dictionnaire, ou saisies dans l'onglet Avancé.",
      "Requêteur SQL (GESALQ) : requête Select (même complexe) dans l'onglet Paramétrage, paramètres %1%, %2%..., boutons Valider et Exécuter ; résultat dans une table temporaire.",
    ],
    source: { label: 'Requêteur (GESALH)', url: `${DOC}GESALH.htm` },
  },
  {
    title: 'Vues X3 (flux sortants du connecteur DHM)',
    lines: [
      "Code vue : 1 à 12 caractères ; abréviation : 1 à 8 caractères ; uniques dans le dictionnaire.",
      "Onglet Requête : SQL natif de la base (un champ pour Oracle, un pour SQL Server) ; formules X3 possibles avec la syntaxe %formule%.",
      "Onglet Champs : doit correspondre exactement aux colonnes de la requête (nom, type, longueur, dimension). Onglet Clés : ordres de tri.",
      "Le bouton Validation exécute le create view. Une vue est en lecture seule et se lit comme une table (classe [F], Filter, For, Read, Link).",
      "Méthode : vérifier champs et liens dans OBJECTS / QUERY (Cloud) ou tester la jointure dans l'onglet SQL (on-premise), puis reporter dans la vue.",
    ],
    source: { label: 'Vues (GESAVW)', url: `${DOC}GESAVW.htm` },
  },
  {
    title: 'X3 Cloud : pas de SQL, GraphQL à la place',
    lines: [
      "Sur X3 Cloud, la base n'est pas accessible : QUERY traduit une syntaxe proche de SOQL en GraphQL, en lecture seule, avec votre session.",
      "Un objet GraphQL (customer, salesOrder...) n'est pas une table X3 : il peut regrouper des champs de plusieurs tables et des champs calculés.",
    ],
    source: { label: 'Requêteur SQL (GESALQ)', url: `${DOC}GESALQ.htm` },
  },
];

export const FORMULA_HELP: DocSection[] = [
  {
    title: 'Expressions X3 (langage adonix)',
    lines: [
      "Une expression se compose de constantes, d'opérateurs, de variables et de fonctions.",
      "Chaînes entre apostrophes ou guillemets ; nombres avec un point décimal (-2.5) ; dates entre crochets [15/3/2002] ; logique 1 = vrai, 0 = faux.",
      "Champ de table : [F:BPC]BPCNUM (classe F + abréviation de la table) ; champ dimensionné avec indice : CHAMP(1).",
      "Opérateurs : + - * / ^ ; comparaison < <= > >= <> ; logiques and, or, xor, not.",
      "Fonctions courantes : len, left$, mid$, toupper (chaînes) ; day, month, addmonth, eomonth (dates) ; abs, int, arr (nombres) ; sum, avg, min, max.",
    ],
    source: { label: 'Expressions calculées', url: `${DOC}EXPRESSIONS_CALC.htm` },
  },
  {
    title: 'Où on écrit des formules',
    lines: [
      "Critères de sélection (requêteur, filtres) : expressions logiques sur des champs des tables.",
      "Vues : formules %formule% dans la requête SQL.",
      "Connecteur DHM : filtre du flux sortant (formule + Y_VUEFORSEL), formule passée à YLANAPI pour rejouer un flux, formule de sélection des fils (skill connecteur-dhm-fli).",
      "L'éditeur de formule X3 aide à composer : opérateurs numériques, de comparaison, logiques, fonctions classées par famille.",
    ],
    source: { label: 'Éditeur de formule', url: `${DOC}FORMULA_EDITOR.htm` },
  },
  {
    title: 'Champ calculé ou stocké ?',
    lines: [
      "OBJECTS > un objet > bouton « Stored / required » : Stored = No (calculated) indique un champ calculé, non stocké en base (ex. creditLevelTotal, l'encours client).",
      "Indice rapide : une propriété GraphQL sans code X3 entre parenthèses dans sa description n'est en général pas une colonne de table.",
    ],
    source: { label: 'Expressions calculées', url: `${DOC}EXPRESSIONS_CALC.htm` },
  },
];
