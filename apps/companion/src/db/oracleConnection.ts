import type { DatabaseInfo, QueryColumn } from '@x3i/shared';
import type { DbQueryResult, Logger, QueryOptions, SqlParams, X3ConnectionProvider } from '@x3i/x3-core';
import type { ResolvedDatabase } from '../config/types';
import { toDatabaseError } from './errors';
import { toRow } from './serialize';

type OracleDb = typeof import('oracledb');
type Pool = import('oracledb').Pool;

/**
 * Oracle access (oracledb thin mode, no Instant Client). Every statement runs after
 * SET TRANSACTION READ ONLY and is followed by a rollback.
 */
export class OracleConnectionProvider implements X3ConnectionProvider {
  readonly type = 'oracle' as const;
  readonly info: DatabaseInfo;
  private poolP: Promise<{ oracledb: OracleDb; pool: Pool }> | undefined;

  constructor(
    private readonly db: ResolvedDatabase,
    private readonly logger: Logger,
  ) {
    this.info = { type: 'oracle', host: db.host, database: db.service ?? '', schema: db.schema.toUpperCase(), user: db.user };
  }

  private pool(): Promise<{ oracledb: OracleDb; pool: Pool }> {
    this.poolP ??= (async () => {
      const mod = (await import('oracledb')) as unknown as { default?: OracleDb } & OracleDb;
      const oracledb = mod.default ?? mod;
      oracledb.fetchAsString = [oracledb.CLOB];
      const pool = await oracledb.createPool({
        user: this.db.user,
        password: this.db.password,
        connectString: `${this.db.host}:${this.db.port ?? 1521}/${this.db.service}`,
        poolMin: 0,
        poolMax: 4,
      });
      this.logger.info(`connected to Oracle ${this.db.host}/${this.db.service} as ${this.db.user}`);
      return { oracledb, pool };
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
    const { oracledb, pool } = await this.pool();
    const conn = await pool.getConnection();
    const limit = Math.max(1, Math.floor(options.maxRows)) + 1;
    try {
      conn.callTimeout = options.timeoutMs;
      await conn.execute('SET TRANSACTION READ ONLY');
      const r = await conn.execute<Record<string, unknown>>(sql, params, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: limit });
      const columns: QueryColumn[] = (r.metaData ?? []).map((m) => (m.dbTypeName ? { name: m.name, sqlType: m.dbTypeName.toLowerCase() } : { name: m.name }));
      const names = columns.map((c) => c.name);
      const raw = r.rows ?? [];
      return { columns, rows: raw.slice(0, limit - 1).map((row) => toRow(row, names)), truncated: raw.length >= limit };
    } finally {
      try {
        await conn.rollback();
      } finally {
        await conn.close();
      }
    }
  }

  async checkWriteAccess(): Promise<boolean | null> {
    return null; // privileges are too varied on Oracle to conclude reliably; rely on the DBA
  }

  async close(): Promise<void> {
    const p = this.poolP;
    this.poolP = undefined;
    if (p) await (await p).pool.close(0).catch(() => undefined);
  }
}
