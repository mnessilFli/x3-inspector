import type { CompanionEnvironmentInfo } from './environment';
import type { DictionaryStatus } from './metadata';

export const COMPANION_NAME = 'x3-inspector-companion';
export const DEFAULT_COMPANION_PORT = 8642;
export const DEFAULT_COMPANION_URL = `http://127.0.0.1:${DEFAULT_COMPANION_PORT}`;

/** Header carrying the companion environment id on every metadata / query call. */
export const ENV_HEADER = 'X-X3I-Env';

export interface HealthResponse {
  status: 'ok';
  name: typeof COMPANION_NAME;
  version: string;
  authenticated: boolean;
  /** Only present when authenticated. */
  environments?: CompanionEnvironmentInfo[];
}

export type ConnectionState = 'ok' | 'error' | 'not-configured';

/** GET /status : detailed state of one environment. */
export interface EnvironmentStatus {
  environment: CompanionEnvironmentInfo;
  connection: ConnectionState;
  message: string;
  /** SQL Server only: the login is db_owner or db_datawriter. null when unknown. */
  writeAccessWarning: boolean | null;
  tableCount: number | null;
  dictionary: DictionaryStatus | null;
  readOnly: true;
  maxRowsDefault: number;
  maxRowsLimit: number;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden-origin'
  | 'unknown-environment'
  | 'missing-environment'
  | 'not-found'
  | 'bad-request'
  | 'sql-rejected'
  | 'query-disabled'
  | 'database-error'
  | 'internal';
