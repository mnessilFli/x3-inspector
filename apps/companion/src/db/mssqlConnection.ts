import type { DatabaseInfo, QueryColumn } from '@x3i/shared';
import type { DbQueryResult, Logger, QueryOptions, SqlParams, X3ConnectionProvider } from '@x3i/x3-core';
import type { ResolvedDatabase } from '../config/types';
import { toDatabaseError } from './errors';
import { toRow } from './serialize';

type Mssql = typeof import('mssql');
type Pool = import('mssql').ConnectionPool;

/**
 * SQL Server access. Every statement runs inside a transaction that is ALWAYS rolled back,
 * with SET ROWCOUNT as row cap and a cancellation timer as timeout.
 */
export class MssqlConnectionProvider implements X3ConnectionProvider {
  readonly type = 'mssql' as const;
  readonly info: DatabaseInfo;
  private poolP: Promise<{ mssql: Mssql; pool: Pool }> | undefined;

  constructor(
    private readonly db: ResolvedDatabase,
    private readonly maxTimeoutMs: number,
    private readonly logger: Logger,
  ) {
    this.info = { type: 'mssql', host: db.instance ? `${db.host}\\${db.instance}` : db.host, database: db.database, schema: db.schema, user: db.user };
  }

  private pool(): Promise<{ mssql: Mssql; pool: Pool }> {
    this.poolP ??= (async () => {
      const mod = (await import('mssql')) as unknown as { default?: Mssql } & Mssql;
      const mssql = mod.default ?? mod;
      const config: import('mssql').config = {
        server: this.db.host,
        database: this.db.database,
        user: this.db.user,
        password: this.db.password,
        connectionTimeout: 20000,
        requestTimeout: this.maxTimeoutMs,
        pool: { max: 4, min: 0, idleTimeoutMillis: 60000 },
        options: {
          encrypt: this.db.encrypt,
          trustServerCertificate: this.db.trustServerCertificate,
          readOnlyIntent: true,
          appName: 'x3-inspector-companion',
        },
      };
      if (this.db.instance) config.options = { ...config.options, instanceName: this.db.instance };
      else config.port = this.db.port ?? 1433;
      const pool = await new mssql.ConnectionPool(config).connect();
      this.logger.info(`connected to SQL Server ${this.info.host}/${this.db.database} as ${this.db.user}`);
      return { mssql, pool };
    })();
    this.poolP.catch(() => {
      this.poolP = undefined;
    });
    return this.poolP;
  }

  async runReadOnly(sql: string, params: SqlParams, options: QueryOptions): Promise<DbQueryResult> {
    try {
      return await this.run(sql, params, options);
    } catch (e) {
      throw toDatabaseError(e);
    }
  }

  private async run(sql: string, params: SqlParams, options: QueryOptions): Promise<DbQueryResult> {
    const { mssql, pool } = await this.pool();
    const tx = new mssql.Transaction(pool);
    const isolation = this.db.isolation === 'read-committed' ? mssql.ISOLATION_LEVEL.READ_COMMITTED : mssql.ISOLATION_LEVEL.READ_UNCOMMITTED;
    await tx.begin(isolation);
    const req = new mssql.Request(tx);
    for (const [k, v] of Object.entries(params)) req.input(k, v);
    const limit = Math.max(1, Math.floor(options.maxRows)) + 1;
    const timer = setTimeout(() => req.cancel(), options.timeoutMs);
    try {
      // ROWCOUNT is a session setting: it is set on every call, so a pooled connection never keeps a stale value.
      const result = await req.query(`SET ROWCOUNT ${limit};\n${sql}`);
      const sets = (result.recordsets as unknown as Array<Array<Record<string, unknown>> & { columns?: Record<string, { index: number; name: string; type?: { declaration?: string } }> }>) ?? [];
      const rs = sets[0] ?? [];
      const meta = rs.columns ? Object.values(rs.columns).sort((a, b) => a.index - b.index) : [];
      const columns: QueryColumn[] = meta.map((m) => (m.type?.declaration ? { name: m.name, sqlType: m.type.declaration } : { name: m.name }));
      const names = columns.length ? columns.map((c) => c.name) : Object.keys(rs[0] ?? {});
      const rows = Array.from(rs).slice(0, limit - 1).map((r) => toRow(r, names));
      if (sets.length > 1) this.logger.warn(`query returned ${sets.length} result sets, only the first one is kept`);
      return { columns: columns.length ? columns : names.map((name) => ({ name })), rows, truncated: rs.length >= limit };
    } finally {
      clearTimeout(timer);
      try {
        await tx.rollback();
      } catch {
        // already aborted (error or cancel): nothing to undo
      }
    }
  }

  async checkWriteAccess(): Promise<boolean | null> {
    try {
      const r = await this.runReadOnly("SELECT IS_ROLEMEMBER('db_owner') AS O, IS_ROLEMEMBER('db_datawriter') AS W", {}, { maxRows: 1, timeoutMs: 10000 });
      const row = r.rows[0];
      if (!row) return null;
      return row.O === 1 || row.W === 1;
    } catch (e) {
      this.logger.warn('cannot check write access', { error: (e as Error).message });
      return null;
    }
  }

  async close(): Promise<void> {
    const p = this.poolP;
    this.poolP = undefined;
    if (p) await (await p).pool.close().catch(() => undefined);
  }
}
