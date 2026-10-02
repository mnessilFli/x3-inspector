import type { CellValue } from '@x3i/shared';
import type { CatalogColumn, CatalogIndexColumn, CatalogSource, CatalogTable, Logger, X3ConnectionProvider } from '@x3i/x3-core';
import { CATALOG_QUERIES, containsPattern } from './catalogQueries';

const METADATA_TIMEOUT_MS = 120000;
const MAX_METADATA_ROWS = 500000;

/** Physical catalog of the folder schema read from SQL Server or Oracle system catalogs. */
export class SqlCatalogSource implements CatalogSource {
  readonly kind = 'sql-catalog' as const;
  private readonly schemaParam: string;

  constructor(
    private readonly conn: X3ConnectionProvider,
    schema: string,
    private readonly logger: Logger,
  ) {
    this.schemaParam = conn.type === 'oracle' ? schema.toUpperCase() : schema;
  }

  private q(): (typeof CATALOG_QUERIES)['mssql'] {
    return CATALOG_QUERIES[this.conn.type];
  }

  private async run(sql: string, params: Record<string, string | number>, maxRows = MAX_METADATA_ROWS) {
    return (await this.conn.runReadOnly(sql, params, { maxRows, timeoutMs: METADATA_TIMEOUT_MS })).rows;
  }

  async listTables(): Promise<CatalogTable[]> {
    let rows: Array<Record<string, CellValue>>;
    try {
      rows = await this.run(this.q().tables, { s: this.schemaParam });
    } catch (e) {
      const fallback = this.q().tablesFallback;
      if (!fallback) throw e;
      this.logger.warn('sys.* catalog not readable, falling back to INFORMATION_SCHEMA (no row counts)', { error: (e as Error).message });
      rows = await this.run(fallback, { s: this.schemaParam });
    }
    this.logger.info(`catalog: ${rows.length} tables in schema ${this.schemaParam}`);
    return rows.map((r) => ({ name: String(r.TABLE_NAME), rowCount: r.ROW_COUNT === null || r.ROW_COUNT === undefined ? null : Number(r.ROW_COUNT) }));
  }

  async getColumns(table: string): Promise<CatalogColumn[]> {
    const rows = await this.run(this.q().columns, { s: this.schemaParam, t: table });
    return rows.map(toColumn);
  }

  async getAllIndexes(): Promise<CatalogIndexColumn[]> {
    const rows = await this.run(this.q().indexes, { s: this.schemaParam });
    return rows.map((r) => ({
      table: String(r.TABLE_NAME),
      index: String(r.INDEX_NAME),
      unique: truthy(r.IS_UNIQUE),
      primary: truthy(r.IS_PRIMARY),
      ordinal: Number(r.KEY_ORDINAL),
      column: String(r.COLUMN_NAME),
    }));
  }

  async findColumns(name: string, mode: 'exact' | 'contains', limit: number): Promise<CatalogColumn[]> {
    const sql = mode === 'exact' ? this.q().findColumnsExact : this.q().findColumnsLike;
    const q = mode === 'exact' ? name : containsPattern(name);
    const rows = await this.run(sql, { s: this.schemaParam, q, n: limit }, limit);
    return rows.map(toColumn);
  }
}

function truthy(v: CellValue | undefined): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

function num(v: CellValue | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toColumn(r: Record<string, CellValue>): CatalogColumn {
  return {
    table: String(r.TABLE_NAME),
    name: String(r.COLUMN_NAME),
    ordinal: Number(r.ORDINAL_POSITION),
    dataType: String(r.DATA_TYPE).toLowerCase(),
    length: num(r.DATA_LENGTH),
    precision: num(r.DATA_PRECISION),
    scale: num(r.DATA_SCALE),
    nullable: r.NULLABLE === 'YES' || r.NULLABLE === 'Y',
  };
}
