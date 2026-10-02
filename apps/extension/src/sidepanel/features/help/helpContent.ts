/**
 * Static help content (French, for the Flowline team). Sources:
 * - X3 shortcuts: Sage X3 V12 online help, "Liste des principaux raccourcis" (read 2026-10-02).
 * - DHM connector: skill connecteur-dhm-fli (analysis of the connector sources, 25/09/2026).
 * - Examples (BPCNUM, type BPN, OBPC, BPC0): observed on X3 Cloud PREPROD on 2026-10-02.
 */

export const CONCEPTS: string[][] = [
  ['Objet (Account)', 'Objet X3 (BPC) et sa table principale. En GraphQL : objet customer', 'Field > Object · OBJECTS'],
  ['Champ (API name)', 'Code champ X3 (BPCNUM). En SQL on-premise : colonne BPCNUM_0', 'Field > Screen field'],
  ['Record Id', 'Clé de l\'objet (BPCNUM). En GraphQL : _id', 'Field > Record key · Record'],
  ['Lookup', 'Champ dont le type de données pointe vers une autre table (BPCNUM : type BPN Numéro tiers). Échap + F9 ouvre l\'élément lié', 'Record : "(reference)" · OBJECTS : → objet'],
  ['Picklist', 'Menu local (numéro, ex. 1 = Non / Oui) ou table diverse', 'Field > Local menu'],
  ['Formula field', 'Champ calculé, non stocké en base (ex. creditLevelTotal, encours)', 'OBJECTS > Stored = No (calculated)'],
  ['Page layout', 'Écran (BPC0, BPRBPC) regroupés dans une fenêtre (OBPC)', 'Field > Screen / Window'],
  ['App / onglet', 'Fonction du menu (GESBPC = Données de base > Tiers > Clients)', 'Screen > Function'],
  ['Champ / objet custom (__c)', 'Code commençant par X, Y ou Z, code activité spécifique', 'badge CUSTOM'],
  ['Sandbox / Production', 'Endpoint et dossier (Pré-Prod / PREPROD, PROD)', 'Screen > Endpoint'],
  ['SOQL', 'SQL sur la base (on-premise) ou GraphQL (X3 Cloud)', 'QUERY (Cloud) · SQL (Companion)'],
  ['Describe / Setup > Fields', 'Dictionnaire X3 (on-premise) ou schéma GraphQL (Cloud)', 'OBJECTS'],
  ['Apex, triggers, flows', 'L4G : traitements spécifiques, points d\'entrée, actions sur les champs', '-'],
  ['Data Loader', 'Modèles d\'import / export', '-'],
];

export const INSPECTOR_KEYS: string[][] = [
  ['Alt + X', 'Ouvrir X3 Inspector'],
  ['Ctrl + Shift + X', 'Activer / arrêter Inspect fields'],
  ['Clic dans un champ X3', 'CURRENT > Field se met à jour seul (nom technique, écran, fenêtre)'],
  ['Échap puis F6 dans X3', 'Ajoute le type de données X3 du champ à la carte Field'],
  ['Ctrl + Entrée (QUERY)', 'Lancer la requête'],
  ['Ctrl + Espace (QUERY)', 'Insérer tous les champs suggérés'],
  ['Survol d\'un mot (QUERY)', 'Libellé, code X3, type, objet lié'],
];

export const SHORTCUTS_SOURCE = 'https://online-help.sagex3.com/erp/12/fr-fr/Content/KEYS/index.htm';

export const SHORTCUTS: string[][] = [
  ['Échap + F6', 'Ouvrir les propriétés d\'un champ (champ, écran, type de données, longueur)'],
  ['Échap + F9', 'Accéder à l\'élément lié au champ'],
  ['Échap + F1', 'Ouvrir l\'aide en ligne (sur le champ si le curseur y est)'],
  ['Échap + M / Échap + F4', 'Ouvrir le menu Actions du champ'],
  ['Échap + S / Échap + F7', 'Ouvrir la fenêtre de recherche'],
  ['Échap + F11', 'Afficher / masquer le volet de sélection'],
  ['Échap + F5', 'Actualiser le volet de sélection'],
  ['Échap + J / Échap + K', 'Fiche précédente / suivante'],
  ['Échap + B', 'Enregistrer'],
  ['Échap + E', 'Abandon'],
  ['Échap + Alt + U', 'Actualiser'],
  ['Échap + Ctrl + P', 'Exporter'],
  ['Échap + G + N', 'Ouvrir le menu de navigation'],
];

export const DHM_SOURCE = 'skill connecteur-dhm-fli, analyse des sources du connecteur (25/09/2026). En cas de doute, la version installée chez le client fait foi.';

export const DHM_FLOWS: string[][] = [
  [
    'Entrant SF → X3',
    'Salesforce appelle le web service X3 YWWS<EXT>, généré depuis un modèle d\'import YAPI (Génération complète). Le traitement généré YWWSSP<EXT> écrit un CSV dans tmp puis lance l\'import (script standard IMPBPC, IMPBPR... chaîné à YCAPITRTIMP). L\'Id Salesforce est mémorisé dans YINDEXAPI.',
  ],
  [
    'Sortant X3 → SF',
    'Flux paramétrés dans YMAPPAPI (en-tête) et YMAPPAPID (mapping). Le moteur SEND_API lit une vue (filtre + Y_VUEFORSEL), puis envoie POST / PATCH / DELETE vers Salesforce. Déclenché par GESOBJET (création, modification) ou à la main par YLANAPI (avec trace : le bon outil pour rejouer).',
  ],
  ['Log API', 'Fonction YLAPI. Rien n\'est logué si YWSTYPLOG ne vaut ni 1 ni 2 ; détail selon YCAPI_LOG et le niveau de log du modèle ou du flux.'],
];

export const DHM_RULES: string[] = [
  'Toute modification d\'un modèle YAPI : Enregistrer puis Génération complète (le traitement YWWSSP<EXT> est figé à la génération).',
  'Indicateurs obligatoires : sans indicateur renseigné, le CSV est vide, rien n\'est importé mais le WS répond OK.',
  'Une ligne "/" en tête de chaque groupe de champs, sinon "Séparateur (/) non référencé".',
  'Avec un objet, le script d\'import standard est obligatoire (IMPBPC...) : script vide = cause probable du Read Timeout.',
  'Sortant : un code 500 peut venir du login SOAP X3 vers Salesforce ; un 401 en OAuth d\'un token vide (trace "SFDC_OAUTH").',
  'Sortant : une vue vide ou un flux inactif ne part pas ; un point d\'entrée SEND_API_VUE arrête tout le flux.',
  'Pour écrire la vue d\'un flux sortant : repérer champs et liens dans OBJECTS / QUERY (Cloud) ou tester la jointure dans SQL (on-premise).',
];
