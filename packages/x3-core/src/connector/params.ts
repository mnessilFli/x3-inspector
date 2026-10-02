/**
 * General parameters of the Flowline connector (YCAPI) and what the connector code does with them.
 * Source: skill connecteur-dhm-fli (analysis of the connector sources, 25/09/2026):
 * reference/api-rest.md "Parametres generaux du domaine", logs.md, flux-sortant.md,
 * dictionnaire-installation.md (list of general parameters delivered with the connector).
 */
export interface ConnectorParam {
  code: string;
  role: string;
  /** Never displayed: only "set" / "empty". */
  secret: boolean;
  ref: string;
}

export const CONNECTOR_PARAMS: readonly ConnectorParam[] = [
  { code: 'YWSTYPLOG', role: 'Type de log : "1" = Log API (YLAPI), "2" = Document EDI ; autre ou vide = aucun log, en silence.', secret: false, ref: 'YCAPITOOLS:686-702' },
  { code: 'YCAPIURIEV', role: '"2" = l\'URI des flux sortants (Y_URI) est évaluée comme expression L4G, pour tous les flux.', secret: false, ref: 'YCAPITOOLS:487' },
  { code: 'YLOGURL', role: 'Login Salesforce : endpoint SOAP complet (mode login SOAP) ou URL de base de l\'org (mode OAuth). Changer de mode impose de le revoir.', secret: false, ref: 'YCAPITOOLS:152, 2121' },
  { code: 'YLOGURSN', role: 'Utilisateur Salesforce du login SOAP.', secret: false, ref: 'flux-sortant.md, authentification' },
  { code: 'YLOGPASS', role: 'Mot de passe Salesforce du login SOAP (secret : jamais affiché).', secret: true, ref: 'flux-sortant.md, authentification' },
  { code: 'YLOGCURL', role: 'Répertoire (V11) ou chemin de l\'exécutable curl (login SOAP en batch, méthode forcée).', secret: false, ref: 'YCAPITOOLS:257, 1679' },
  { code: 'YCAPIKEY', role: 'Client id OAuth2 (client_credentials). Renseigné : le connecteur utilise OAuth au lieu du login SOAP.', secret: false, ref: 'YCAPITOOLS:76-79' },
  { code: 'YCAPISECR', role: 'Client secret OAuth2 (secret : jamais affiché).', secret: true, ref: 'YCAPITOOLS:76-79' },
  { code: 'YLARCHAPI', role: 'Répertoire des pièces jointes (body envoyé : <flux>.txt) et des fichiers curl.', secret: false, ref: 'YCAPITOOLS:499, 1655' },
  { code: 'YCAPIAUTH', role: '"login:mot de passe" admin Syracuse utilisé par curl (secret : jamais affiché).', secret: true, ref: 'YCAPITOOLS:1893' },
  { code: 'YCAPITRA', role: 'Paramètre livré avec le connecteur (rôle non détaillé dans le skill).', secret: false, ref: 'YCAPINETSPV:69-209' },
  { code: 'YFLUXEDI', role: 'Paramètre livré avec le connecteur (rôle non détaillé dans le skill).', secret: false, ref: 'YCAPINETSPV:69-209' },
  { code: 'YNUMEDIFLU', role: 'Paramètre livré avec le connecteur (rôle non détaillé dans le skill).', secret: false, ref: 'YCAPINETSPV:69-209' },
  { code: 'YWEBREST', role: 'Paramètre livré avec le connecteur (rôle non détaillé dans le skill).', secret: false, ref: 'YCAPINETSPV:69-209' },
  { code: 'YWSENTEDI', role: 'Paramètre livré avec le connecteur (rôle non détaillé dans le skill).', secret: false, ref: 'YCAPINETSPV:69-209' },
];

/** User parameter (per X3 user, e.g. the pool user): "2" = debug mode, password in clear in the trace. */
export const CONNECTOR_USER_PARAMS: readonly ConnectorParam[] = [
  { code: 'YMODTEST', role: '"2" = mode debug : body et retour tracés, fichiers curl et login.xml conservés. Attention : mot de passe en clair dans la trace.', secret: false, ref: 'YCAPITOOLS:125-190' },
];

/** Codes that look like secrets even if not listed (extra Y* parameters of a client). */
export function looksSecret(code: string): boolean {
  return CONNECTOR_PARAMS.some((p) => p.code === code && p.secret) || /PASS|PWD|SECR|TOKEN|AUTH/i.test(code);
}

export function connectorParam(code: string): ConnectorParam | undefined {
  return [...CONNECTOR_PARAMS, ...CONNECTOR_USER_PARAMS].find((p) => p.code === code);
}
