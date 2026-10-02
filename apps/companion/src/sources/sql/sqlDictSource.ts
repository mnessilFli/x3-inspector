import type { CatalogSource, DictFilter, DictRow, DictSource, X3ConnectionProvider } from '@x3i/x3-core';
import { paramPlaceholder } from '@x3i/x3-core';
import { assertIdentifier } from '../../db/serialize';
import { escapeLike } from './catalogQueries';

const DICT_TIMEOUT_MS = 60000;
const MAX_DICT_ROWS = 300000;
const MAX_IN_VALUES = 500;

export interface BuiltQuery {
  sql: string;
  params: Record<string, string | number>;
}

/**
 * X3 dictionary tables read with parameterized queries. Table and column names come from the
 * probe (checked against the catalog) and are validated again before being delimited.
 */
export class SqlDictSource implements DictSource {
  readonly kind = 'x3-dictionary' as const;

  constructor(
    private readonly conn: X3ConnectionProvider,
    private readonly catalog: CatalogSource,
    private readonly schema: string,
  ) {}

  async getColumns(table: string): Promise<string[] | null> {
    const cols = await this.catalog.getColumns(table);
    return cols.length ? cols.map((c) => c.name) : null;
  }

  async select(table: string, columns: string[], where: DictFilter[], limit?: number): Promise<DictRow[]> {
    const q = buildDictSelect(this.conn.type, this.schema, table, columns, where);
    const r = await this.conn.runReadOnly(q.sql, q.params, { maxRows: limit ?? MAX_DICT_ROWS, timeoutMs: DICT_TIMEOUT_MS });
    return r.rows.map((row) => {
      const out: DictRow = {};
      for (const c of columns) {
        const v = row[c] ?? row[c.toUpperCase()];
        out[c] = typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
      }
      return out;
    });
  }
}

export function buildDictSelect(type: 'mssql' | 'oracle', schema: string, table: string, columns: string[], where: DictFilter[]): BuiltQuery {
  const ident = (name: string) => (type === 'mssql' ? `[${assertIdentifier(name)}]` : `"${assertIdentifier(name)}"`);
  const schemaId = type === 'oracle' ? schema.toUpperCase() : schema;
  const params: Record<string, string | number> = {};
  let n = 0;
  const p = (v: string | number) => {
    const name = `p${n++}`;
    params[name] = v;
    return paramPlaceholder(type, name);
  };
  const conditions = where.map((f) => {
    const col = ident(f.column);
    switch (f.op) {
      // eq / in compare as is so that dictionary indexes stay usable: X3 codes are stored upper case
      case 'eq':
        return `${col} = ${p(f.value)}`;
      case 'in': {
        const values = f.values.slice(0, MAX_IN_VALUES);
        if (values.length === 0) return '1 = 0';
        return `${col} IN (${values.map((v) => p(v)).join(', ')})`;
      }
      case 'like': {
        // only % is a wildcard in DictFilter: escape the other LIKE metacharacters
        const pattern = f.value.split('%').map(escapeLike).join('%');
        return `UPPER(${col}) LIKE UPPER(${p(pattern)}) ESCAPE '\\'`;
      }
    }
  });
  const sql = `SELECT ${columns.map(ident).join(', ')} FROM ${ident(schemaId)}.${ident(table)}${conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''}`;
  return { sql, params };
}
