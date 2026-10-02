import {
  ENV_HEADER,
  type ApiErrorBody,
  type ApiErrorCode,
  type CompanionEnvironmentInfo,
  type DictionaryStatus,
  type EnvironmentStatus,
  type HealthResponse,
  type QueryRequest,
  type QueryResult,
  type RecordRequest,
  type RecordResult,
  type SqlValidation,
  type X3Field,
  type X3FieldUsage,
  type X3LocalMenu,
  type X3Relation,
  type X3SearchResult,
  type X3Table,
  type X3TableSummary,
} from '@x3i/shared';
import type { PageResolution, PageResolutionInput } from '@x3i/x3-core';
import { createLogger } from './logger';

const log = createLogger('companion');

export type ClientErrorCode = ApiErrorCode | 'network' | 'timeout' | 'bad-response';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return `${e.message} (${e.code}${e.status ? `, HTTP ${e.status}` : ''})`;
  return e instanceof Error ? e.message : String(e);
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

/** Typed client of the companion API (contract in packages/shared/src/api.ts). The token is never logged. */
export class CompanionClient {
  readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string | undefined,
    readonly envId: string | undefined,
    private readonly defaultTimeoutMs = 60000,
  ) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
  }

  get hasToken(): boolean {
    return Boolean(this.token);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, auth = true, timeoutMs = this.defaultTimeoutMs } = options;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    if (auth && this.envId) headers[ENV_HEADER] = this.envId;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const started = performance.now();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
        credentials: 'omit',
      });
    } catch (e) {
      if (ctrl.signal.aborted) throw new ApiError(0, 'timeout', `Companion did not answer within ${Math.round(timeoutMs / 1000)} s`);
      throw new ApiError(0, 'network', `Companion unreachable at ${this.baseUrl}. Is it started? (${(e as Error).message})`);
    } finally {
      clearTimeout(timer);
    }
    log.debug(`${method} ${path} -> ${res.status} in ${Math.round(performance.now() - started)} ms`);
    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new ApiError(res.status, 'bad-response', `Non JSON response from the companion (HTTP ${res.status})`);
      }
    }
    if (!res.ok) {
      const err = (json as ApiErrorBody | undefined)?.error;
      throw new ApiError(res.status, err?.code ?? 'internal', err?.message ?? `HTTP ${res.status}`, err?.details);
    }
    return json as T;
  }

  health(): Promise<HealthResponse> {
    return this.request('/health', { auth: Boolean(this.token), timeoutMs: 8000 });
  }

  status(): Promise<EnvironmentStatus> {
    return this.request('/status', { timeoutMs: 30000 });
  }

  environments(): Promise<CompanionEnvironmentInfo[]> {
    return this.request('/environments');
  }

  searchTables(q: string, limit = 50): Promise<X3TableSummary[]> {
    return this.request(`/metadata/tables?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  getTable(table: string): Promise<X3Table> {
    return this.request(`/metadata/tables/${encodeURIComponent(table)}`);
  }

  getFields(table: string): Promise<X3Field[]> {
    return this.request(`/metadata/tables/${encodeURIComponent(table)}/fields`);
  }

  getRelations(table: string): Promise<X3Relation[]> {
    return this.request(`/metadata/tables/${encodeURIComponent(table)}/relations`);
  }

  search(q: string, limit = 30): Promise<X3SearchResult> {
    return this.request(`/metadata/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  fieldUsage(field: string): Promise<X3FieldUsage> {
    return this.request(`/metadata/fields/${encodeURIComponent(field)}/usage`);
  }

  localMenu(menu: number, lang?: string): Promise<X3LocalMenu> {
    return this.request(`/metadata/local-menus/${menu}${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`);
  }

  dictionaryStatus(): Promise<DictionaryStatus> {
    return this.request('/metadata/dictionary/status');
  }

  resolvePage(input: PageResolutionInput): Promise<PageResolution> {
    return this.request('/metadata/resolve-page', { method: 'POST', body: input });
  }

  refresh(): Promise<{ ok: true }> {
    return this.request('/metadata/refresh', { method: 'POST', body: {}, timeoutMs: 120000 });
  }

  validate(sql: string): Promise<SqlValidation> {
    return this.request('/query/validate', { method: 'POST', body: { sql } });
  }

  query(req: QueryRequest): Promise<QueryResult> {
    return this.request('/query', { method: 'POST', body: req, timeoutMs: 180000 });
  }

  record(req: RecordRequest): Promise<RecordResult> {
    return this.request('/record', { method: 'POST', body: req, timeoutMs: 120000 });
  }
}
