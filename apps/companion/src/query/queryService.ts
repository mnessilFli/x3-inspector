import type { QueryResult, RecordRequest, RecordResult, SqlValidation } from '@x3i/shared';
import {
  assertReadOnly,
  buildSelectWhere,
  isNumericSqlType,
  paramPlaceholder,
  qualifyTables,
  quoteSchema,
  stripTrailingSemicolons,
  validateReadOnly,
  type Logger,
  type QueryOptions,
  type X3ConnectionProvider,
  type X3MetadataProvider,
  type X3QueryProvider,
} from '@x3i/x3-core';
import { assertIdentifier } from '../db/serialize';
import { HttpError } from '../http/errors';

/**
 * Read-only query execution: validation (x3-core tokenizer), schema qualification, bounded
 * execution in a rolled back transaction (see the connection providers).
 */
export class QueryService implements X3QueryProvider {
  private tableNamesP: Promise<Map<string, string>> | undefined;

  constructor(
    private readonly conn: X3ConnectionProvider,
    private readonly metadata: X3MetadataProvider,
    private readonly tableNames: () => Promise<string[]>,
    private readonly logger: Logger,
    private readonly logSql: boolean,
  ) {}

  validate(sql: string): SqlValidation {
    return validateReadOnly(sql, { dialect: this.conn.type });
  }

  private names(): Promise<Map<string, string>> {
    this.tableNamesP ??= this.tableNames().then((list) => new Map(list.map((n) => [n.toUpperCase(), n])));
    this.tableNamesP.catch(() => {
      this.tableNamesP = undefined;
    });
    return this.tableNamesP;
  }

  resetCache(): void {
    this.tableNamesP = undefined;
  }

  async execute(sql: string, options: QueryOptions): Promise<QueryResult> {
    assertReadOnly(sql, { dialect: this.conn.type }); // throws ReadOnlyViolation -> 400 sql-rejected
    const names = await this.names();
    const qualified = qualifyTables(stripTrailingSemicolons(sql, this.conn.type), {
      dialect: this.conn.type,
      schema: this.conn.info.schema,
      resolveTable: (n) => names.get(n.toUpperCase()),
    });
    const warnings: string[] = [];
    if (qualified.qualified.length === 0) warnings.push(`No table of schema ${this.conn.info.schema} was recognized: the query runs as written.`);
    if (this.logSql) this.logger.info('query', { sql: qualified.sql, maxRows: options.maxRows });
    const start = Date.now();
    const r = await this.conn.runReadOnly(qualified.sql, {}, options);
    const durationMs = Date.now() - start;
    if (r.truncated) warnings.push(`Result truncated to ${options.maxRows} rows (row limit).`);
    return { columns: r.columns, rows: r.rows, rowCount: r.rows.length, truncated: r.truncated, maxRows: options.maxRows, executedSql: qualified.sql, durationMs, warnings };
  }

  /** Reads one record by key with a parameterized query; table and columns are checked against the catalog. */
  async readRecord(request: RecordRequest, options: QueryOptions): Promise<RecordResult> {
    const table = await this.metadata.getTable(request.table);
    if (!table) throw new HttpError(404, 'not-found', `table ${request.table} not found in schema ${this.conn.info.schema}`);
    if (!Array.isArray(request.key) || request.key.length === 0) throw new HttpError(400, 'bad-request', 'key must contain at least one column');
    const physical = new Map(table.fields.flatMap((f) => f.columns.map((c) => [c.name.toUpperCase(), c] as const)));
    const params: Record<string, string | number> = {};
    const where: string[] = [];
    const display: Array<{ column: string; value: string | number; numeric: boolean }> = [];
    request.key.forEach((k, i) => {
      const col = physical.get(String(k.column).toUpperCase());
      if (!col) throw new HttpError(400, 'bad-request', `column ${k.column} does not exist in ${table.name}`);
      if (typeof k.value !== 'string' && typeof k.value !== 'number') throw new HttpError(400, 'bad-request', `invalid value for ${k.column}`);
      params[`p${i}`] = k.value;
      where.push(`${this.ident(col.name)} = ${paramPlaceholder(this.conn.type, `p${i}`)}`);
      display.push({ column: col.name, value: k.value, numeric: isNumericSqlType(col.sqlType) });
    });
    const sql = `SELECT * FROM ${quoteSchema(this.conn.info.schema, this.conn.type)}.${this.ident(table.name)} WHERE ${where.join(' AND ')}`;
    if (this.logSql) this.logger.info('record', { sql, table: table.name });
    const start = Date.now();
    const r = await this.conn.runReadOnly(sql, params, { maxRows: 2, timeoutMs: options.timeoutMs });
    return {
      table,
      row: r.rows[0] ?? null,
      matches: r.rows.length + (r.truncated ? 1 : 0),
      executedSql: buildSelectWhere(table.name, display, this.conn.type),
      durationMs: Date.now() - start,
    };
  }

  private ident(name: string): string {
    assertIdentifier(name);
    return this.conn.type === 'mssql' ? `[${name}]` : `"${name}"`;
  }
}
