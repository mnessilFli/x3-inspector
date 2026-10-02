import { COMPANION_NAME, ENV_HEADER, type HealthResponse, type QueryRequest, type RecordRequest } from '@x3i/shared';
import { validateReadOnly } from '@x3i/x3-core';
import type { ResolvedConfig } from '../config/types';
import type { EnvironmentRegistry } from '../env/registry';
import type { EnvironmentRuntime } from '../env/runtime';
import { HttpError } from './errors';
import { Router, type RequestContext } from './router';
import { isValidAuthorization } from '../config/token';

export const COMPANION_VERSION = '0.1.0';

const TABLE_NAME = /^[A-Za-z0-9_]{1,64}$/;

export function buildRouter(registry: EnvironmentRegistry, config: ResolvedConfig, token: string): Router {
  const env = (ctx: RequestContext): EnvironmentRuntime => {
    const h = ctx.req.headers[ENV_HEADER.toLowerCase()];
    return registry.get(Array.isArray(h) ? h[0] : h);
  };
  const tableParam = (ctx: RequestContext): string => {
    const t = ctx.params.table ?? '';
    if (!TABLE_NAME.test(t)) throw new HttpError(400, 'bad-request', 'invalid table name');
    return t;
  };
  const limit = (ctx: RequestContext, def: number, max: number): number => {
    const v = Number(ctx.url.searchParams.get('limit') ?? def);
    return Number.isFinite(v) ? Math.min(Math.max(1, Math.floor(v)), max) : def;
  };
  const queryOptions = (requested: unknown) => {
    const n = typeof requested === 'number' && Number.isFinite(requested) ? Math.floor(requested) : config.security.maxRowsDefault;
    return { maxRows: Math.min(Math.max(1, n), config.security.maxRowsLimit), timeoutMs: config.security.queryTimeoutMs };
  };
  const requireQuery = (rt: EnvironmentRuntime) => {
    if (!rt.query) throw new HttpError(409, 'query-disabled', `SQL execution is disabled for environment ${rt.env.id} (no database configured)`);
    return rt.query;
  };
  const sqlBody = (body: unknown): QueryRequest => {
    const b = body as Partial<QueryRequest> | undefined;
    if (!b || typeof b.sql !== 'string' || !b.sql.trim()) throw new HttpError(400, 'bad-request', 'body.sql is required');
    if (b.sql.length > 100000) throw new HttpError(400, 'bad-request', 'query too long');
    return b as QueryRequest;
  };

  return new Router()
    .get(
      '/health',
      async (ctx): Promise<HealthResponse> => {
        const authenticated = isValidAuthorization(ctx.req.headers.authorization, token);
        const res: HealthResponse = { status: 'ok', name: COMPANION_NAME, version: COMPANION_VERSION, authenticated };
        if (authenticated) res.environments = registry.infos();
        return res;
      },
      false,
    )
    .get('/environments', async () => registry.infos())
    .get('/status', async (ctx) => env(ctx).status())
    .get('/metadata/tables', async (ctx) => env(ctx).metadata.searchTables(ctx.url.searchParams.get('q') ?? '', limit(ctx, 50, 500)))
    .get('/metadata/tables/:table', async (ctx) => {
      const t = await env(ctx).metadata.getTable(tableParam(ctx));
      if (!t) throw new HttpError(404, 'not-found', `table ${ctx.params.table} not found`);
      return t;
    })
    .get('/metadata/tables/:table/fields', async (ctx) => env(ctx).metadata.getFields(tableParam(ctx)))
    .get('/metadata/tables/:table/relations', async (ctx) => env(ctx).metadata.getRelations(tableParam(ctx)))
    .get('/metadata/search', async (ctx) => env(ctx).metadata.search(ctx.url.searchParams.get('q') ?? '', limit(ctx, 30, 200)))
    .get('/metadata/fields/:field/usage', async (ctx) => {
      const f = ctx.params.field ?? '';
      if (!TABLE_NAME.test(f)) throw new HttpError(400, 'bad-request', 'invalid field name');
      return env(ctx).metadata.getFieldUsage(f);
    })
    .get('/metadata/local-menus/:menu', async (ctx) => {
      const menu = Number(ctx.params.menu);
      if (!Number.isInteger(menu) || menu < 0) throw new HttpError(400, 'bad-request', 'invalid local menu number');
      const lang = ctx.url.searchParams.get('lang') ?? undefined;
      if (lang !== undefined && !/^[A-Za-z]{2,5}$/.test(lang)) throw new HttpError(400, 'bad-request', 'invalid language');
      const m = await env(ctx).metadata.getLocalMenu(menu, lang?.toUpperCase());
      if (!m) throw new HttpError(404, 'not-found', `local menu ${menu} unknown (dictionary not resolved or no values)`);
      return m;
    })
    .get('/metadata/dictionary/status', async (ctx) => env(ctx).metadata.getDictionaryStatus())
    .post('/metadata/resolve-page', async (ctx) => {
      const b = (ctx.body ?? {}) as { functionCode?: unknown; object?: unknown; screen?: unknown };
      const str = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_]{1,30}$/.test(v) ? v : null);
      return env(ctx).metadata.resolvePage({ functionCode: str(b.functionCode), object: str(b.object), screen: str(b.screen) });
    })
    .post('/metadata/refresh', async (ctx) => {
      await env(ctx).refresh();
      return { ok: true };
    })
    .post('/query/validate', async (ctx) => {
      const rt = env(ctx);
      const { sql } = sqlBody(ctx.body);
      return rt.query ? rt.query.validate(sql) : validateReadOnly(sql, { dialect: 'any' });
    })
    .post('/query', async (ctx) => {
      const rt = env(ctx);
      const q = requireQuery(rt);
      const b = sqlBody(ctx.body);
      return q.execute(b.sql, queryOptions(b.maxRows));
    })
    .post('/record', async (ctx) => {
      const rt = env(ctx);
      const q = requireQuery(rt);
      const b = (ctx.body ?? {}) as Partial<RecordRequest>;
      if (typeof b.table !== 'string' || !TABLE_NAME.test(b.table)) throw new HttpError(400, 'bad-request', 'body.table is required');
      return q.readRecord({ table: b.table, key: Array.isArray(b.key) ? b.key : [] }, queryOptions(2));
    });
}
