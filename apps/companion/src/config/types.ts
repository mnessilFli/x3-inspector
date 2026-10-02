import type { DatabaseType, EnvironmentKind } from '@x3i/shared';
import type { DictionaryMappingOverride } from '@x3i/x3-core';
import type { LogLevel } from '../logger';

/** companion.config.json (never committed). Contains no password: see passwordEnv / x3ConnectProfile. */
export interface CompanionConfigFile {
  server?: {
    host?: string;
    port?: number;
    /** Required to listen on something else than a loopback address. */
    allowRemote?: boolean;
    tls?: { certFile: string; keyFile: string };
  };
  security?: {
    /** Chrome extension ids allowed by CORS. Empty: any chrome-extension:// origin (token still required). */
    allowedExtensionIds?: string[];
    maxRowsDefault?: number;
    maxRowsLimit?: number;
    queryTimeoutMs?: number;
    /** Log the text of executed SQL (never the rows). */
    logSql?: boolean;
  };
  logging?: { level?: LogLevel; file?: string };
  environments: EnvironmentConfigFile[];
}

export interface DatabaseConfigFile {
  type: DatabaseType;
  host: string;
  port?: number;
  /** SQL Server named instance (instead of port). */
  instance?: string;
  /** SQL Server database name. */
  database?: string;
  /** Oracle service name. */
  service?: string;
  /** X3 folder code = SQL schema. */
  schema: string;
  user: string;
  /** Name of the environment variable holding the password (loaded from apps/companion/.env). */
  passwordEnv?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  /** SQL Server isolation for diagnostic reads. Default read-uncommitted (does not block X3 users). */
  isolation?: 'read-uncommitted' | 'read-committed';
}

export interface EnvironmentConfigFile {
  id: string;
  name?: string;
  kind?: EnvironmentKind;
  /** X3 language code for labels. Default FRA. */
  language?: string;
  metadata?: { provider?: 'database' | 'x3-context'; path?: string };
  database?: DatabaseConfigFile;
  /** Path to an x3-connect profile (.x3/<profile>.env) providing the SQL connection and password. */
  x3ConnectProfile?: string;
  dictionaryMapping?: DictionaryMappingOverride;
  technicalFields?: string[];
}

/** Fully resolved configuration used at runtime. */
export interface ResolvedDatabase {
  type: DatabaseType;
  host: string;
  port: number | undefined;
  instance: string | undefined;
  database: string;
  service: string | undefined;
  schema: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  isolation: 'read-uncommitted' | 'read-committed';
}

export interface ResolvedEnvironment {
  id: string;
  name: string;
  kind: EnvironmentKind;
  language: string;
  metadataProvider: 'database' | 'x3-context';
  contextPath: string | undefined;
  database: ResolvedDatabase | undefined;
  dictionaryMapping: DictionaryMappingOverride | undefined;
  technicalFields: string[] | undefined;
}

export interface ResolvedConfig {
  server: { host: string; port: number; allowRemote: boolean; tls: { certFile: string; keyFile: string } | undefined };
  security: { allowedExtensionIds: string[]; maxRowsDefault: number; maxRowsLimit: number; queryTimeoutMs: number; logSql: boolean };
  logging: { level: LogLevel; file: string | undefined };
  environments: ResolvedEnvironment[];
}
