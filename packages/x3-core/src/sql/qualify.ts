import { scanTableRefs } from './tableRefs';
import type { SqlDialect } from './tokenizer';

export interface QualifyOptions {
  dialect: SqlDialect;
  schema: string;
  /** Returns the canonical table name when the table exists in the schema, otherwise undefined. */
  resolveTable: (name: string) => string | undefined;
}

export interface QualifyResult {
  sql: string;
  /** Canonical names of the tables that were prefixed with the schema. */
  qualified: string[];
}

const SIMPLE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteSchema(schema: string, dialect: SqlDialect): string {
  if (SIMPLE_IDENT.test(schema)) return dialect === 'oracle' ? schema.toUpperCase() : schema;
  return dialect === 'mssql' ? `[${schema.replace(/]/g, ']]')}]` : `"${schema.replace(/"/g, '""')}"`;
}

/**
 * Prefixes unqualified table references with the folder schema: FROM BPCUSTOMER -> FROM SEED.BPCUSTOMER.
 * Only tables known in the schema are rewritten; CTE names, functions and already qualified
 * references are left untouched. The rewritten SQL is returned so it can be shown to the user.
 */
export function qualifyTables(sql: string, options: QualifyOptions): QualifyResult {
  const scan = scanTableRefs(sql, options.dialect);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const qualified: string[] = [];
  const schema = quoteSchema(options.schema, options.dialect);

  for (const ref of scan.refs) {
    if (ref.schema !== undefined || ref.isCte) continue;
    const canonical = options.resolveTable(ref.table);
    if (!canonical) continue;
    const tableText = SIMPLE_IDENT.test(canonical) ? canonical : ref.tableToken.text;
    edits.push({ start: ref.tableToken.start, end: ref.tableToken.end, text: `${schema}.${tableText}` });
    qualified.push(canonical);
  }

  let out = sql;
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return { sql: out, qualified: [...new Set(qualified)] };
}
