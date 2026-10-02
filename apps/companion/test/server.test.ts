import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseInfo } from '@x3i/shared';
import type { DbQueryResult, QueryOptions, SqlParams, X3ConnectionProvider } from '@x3i/x3-core';
import { resolveConfig } from '../src/config/loadConfig';
import { EnvironmentRegistry } from '../src/env/registry';
import { EnvironmentRuntime } from '../src/env/runtime';
import { buildRouter } from '../src/http/routes';
import { createServer } from '../src/http/server';
import { createLogger } from '../src/logger';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = 'test-token-0123456789-0123456789-abcdef';
const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

/** Records the SQL it receives and returns canned rows: no database involved. */
class FakeConnection implements X3ConnectionProvider {
  readonly type = 'mssql' as const;
  readonly info: DatabaseInfo = { type: 'mssql', host: 'fake', database: 'db', schema: 'SEED', user: 'ro' };
  readonly calls: Array<{ sql: string; params: SqlParams; options: QueryOptions }> = [];

  async runReadOnly(sql: string, params: SqlParams, options: QueryOptions): Promise<DbQueryResult> {
    this.calls.push({ sql, params, options });
    return { columns: [{ name: 'BPCNUM_0' }], rows: [{ BPCNUM_0: 'C1' }], truncated: false };
  }
  async checkWriteAccess() {
    return false;
  }
  async close() {}
}

const fake = new FakeConnection();
let base = '';
let close: () => Promise<void>;

beforeAll(async () => {
  const contextPath = path.join(here, 'fixtures', 'x3-context');
  const config = resolveConfig(
    {
      server: { port: 1 },
      environments: [
        { id: 'offline', kind: 'DEV', metadata: { provider: 'x3-context', path: contextPath } },
        { id: 'withdb', kind: 'PROD', metadata: { provider: 'x3-context', path: contextPath } },
      ],
    },
    here,
    {},
  );
  const logger = createLogger({ level: 'error' });
  const registry = new EnvironmentRegistry(config, logger, (id) => {
    const env = config.environments.find((e) => e.id === id)!;
    return new EnvironmentRuntime(env, config, logger, id === 'withdb' ? fake : null);
  });
  const server = createServer({ config, router: buildRouter(registry, config, TOKEN), token: TOKEN, logger });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  config.server.port = port; // the Host check uses the real port
  base = `http://127.0.0.1:${port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

afterAll(async () => {
  await close();
});

async function call(pathname: string, init: { method?: string; body?: unknown; env?: string; token?: string | null; origin?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token !== null) headers.Authorization = `Bearer ${init.token ?? TOKEN}`;
  if (init.env) headers['X-X3I-Env'] = init.env;
  if (init.origin) headers.Origin = init.origin;
  const res = await fetch(`${base}${pathname}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers,
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
}

describe('companion HTTP API', () => {
  it('/health works without token but hides environments', async () => {
    const anon = await call('/health', { token: null });
    expect(anon.status).toBe(200);
    expect(anon.body).toMatchObject({ status: 'ok', authenticated: false });
    expect(anon.body.environments).toBeUndefined();
    const auth = await call('/health');
    expect(auth.body.environments.map((e: { id: string }) => e.id)).toEqual(['offline', 'withdb']);
  });

  it('requires the pairing token', async () => {
    expect((await call('/environments', { token: null })).status).toBe(401);
    expect((await call('/environments', { token: 'wrong' })).status).toBe(401);
  });

  it('rejects web origins and answers CORS for the extension', async () => {
    expect((await call('/environments', { origin: 'https://evil.example' })).status).toBe(403);
    const ok = await call('/environments', { origin: ORIGIN });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('requires a known environment', async () => {
    expect((await call('/metadata/tables')).body.error.code).toBe('missing-environment');
    expect((await call('/metadata/tables', { env: 'nope' })).status).toBe(404);
  });

  it('serves metadata from x3-context files', async () => {
    const tables = await call('/metadata/tables?q=BPC', { env: 'offline' });
    expect(tables.body[0]).toMatchObject({ name: 'BPCUSTOMER', description: { value: 'Clients, fiche' } });
    const t = await call('/metadata/tables/BPCUSTOMER', { env: 'offline' });
    expect(t.body.fields.find((f: { name: string }) => f.name === 'BPCSTA').localMenu.value).toBe(1);
    const menu = await call('/metadata/local-menus/1', { env: 'offline' });
    expect(menu.body.values).toEqual([
      { value: 1, label: 'Non' },
      { value: 2, label: 'Oui' },
    ]);
    const rel = await call('/metadata/tables/SORDER/relations', { env: 'offline' });
    expect(rel.body[0]).toMatchObject({ toTable: 'BPCUSTOMER', kind: 'dictionary-type-link' });
    const status = await call('/metadata/dictionary/status', { env: 'offline' });
    expect(status.body.blocks.find((b: { block: string }) => b.block === 'fields').usable).toBe(true);
    expect((await call('/metadata/tables/NOPE', { env: 'offline' })).status).toBe(404);
    expect((await call('/metadata/tables/BAD;NAME', { env: 'offline' })).status).toBe(400);
  });

  it('resolves the page context', async () => {
    const r = await call('/metadata/resolve-page', { env: 'offline', body: { functionCode: 'GESBPC' } });
    expect(r.body.mainTable).toMatchObject({ value: 'BPCUSTOMER', prov: { confidence: 'METADATA' } });
  });

  it('disables SQL when no database is configured', async () => {
    const r = await call('/query', { env: 'offline', body: { sql: 'SELECT 1' } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('query-disabled');
  });

  it('rejects destructive SQL before reaching the database', async () => {
    const before = fake.calls.length;
    const r = await call('/query', { env: 'withdb', body: { sql: 'DELETE FROM BPCUSTOMER' } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('sql-rejected');
    expect(r.body.error.details.ok).toBe(false);
    expect(fake.calls.length).toBe(before);
  });

  it('qualifies tables, strips the final semicolon and caps rows', async () => {
    const r = await call('/query', { env: 'withdb', body: { sql: "SELECT * FROM bpcustomer WHERE BPCNUM_0 = 'C1';", maxRows: 999999 } });
    expect(r.status).toBe(200);
    expect(r.body.executedSql).toBe("SELECT * FROM SEED.BPCUSTOMER WHERE BPCNUM_0 = 'C1'");
    expect(r.body.maxRows).toBe(5000);
    expect(fake.calls.at(-1)?.options.maxRows).toBe(5000);
    expect(r.body.rows).toEqual([{ BPCNUM_0: 'C1' }]);
  });

  it('reads a record with a parameterized query', async () => {
    const r = await call('/record', { env: 'withdb', body: { table: 'BPCUSTOMER', key: [{ column: 'bpcnum_0', value: "O'X" }] } });
    expect(r.status).toBe(200);
    expect(fake.calls.at(-1)).toMatchObject({ sql: 'SELECT * FROM SEED.[BPCUSTOMER] WHERE [BPCNUM_0] = @p0', params: { p0: "O'X" } });
    expect(r.body.executedSql).toBe("SELECT *\nFROM BPCUSTOMER\nWHERE BPCNUM_0 = 'O''X'");
    const bad = await call('/record', { env: 'withdb', body: { table: 'BPCUSTOMER', key: [{ column: 'NOPE_0', value: 1 }] } });
    expect(bad.status).toBe(400);
  });

  it('validates without executing', async () => {
    const r = await call('/query/validate', { env: 'offline', body: { sql: 'SELECT 1; DROP TABLE X' } });
    expect(r.body.ok).toBe(false);
  });
});
