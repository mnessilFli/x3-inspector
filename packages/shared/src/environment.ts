export type EnvironmentKind = 'DEV' | 'TEST' | 'PREPROD' | 'PROD';

export const ENVIRONMENT_KINDS: readonly EnvironmentKind[] = ['DEV', 'TEST', 'PREPROD', 'PROD'];

/** Environment as known by the extension. Contains no secret. */
export interface ExtensionEnvironment {
  id: string;
  name: string;
  kind: EnvironmentKind;
  /** Base URL used to open X3 in the browser, e.g. http://x3server:8124 */
  x3Url: string;
  /** X3 folder code (also the SQL schema), e.g. SEED. */
  folder: string;
  /** Companion base URL, e.g. http://127.0.0.1:8642 */
  companionUrl: string;
  /** Environment id configured in the companion. */
  companionEnvId: string;
}

export type MetadataProviderKind = 'database' | 'x3-context';

export type DatabaseType = 'mssql' | 'oracle';

/** Connection description without any secret. */
export interface DatabaseInfo {
  type: DatabaseType;
  host: string;
  database: string;
  schema: string;
  user: string;
}

/** Environment as exposed by the companion (/environments). Contains no secret. */
export interface CompanionEnvironmentInfo {
  id: string;
  name: string;
  kind: EnvironmentKind;
  language: string;
  metadataProvider: MetadataProviderKind;
  database: DatabaseInfo | null;
  queryEnabled: boolean;
}
