import type { CellValue, X3Relation } from '@x3i/shared';
import type { SqlDialect } from './tokenizer';

const SIMPLE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMERIC_LITERAL = /^-?\d+(\.\d+)?$/;
const NUMERIC_TYPES = new Set([
  'int', 'integer', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney',
  'number', 'binary_float', 'binary_double', 'bit',
]);

export function isNumericSqlType(sqlType: string | undefined): boolean {
  return sqlType !== undefined && NUMERIC_TYPES.has(sqlType.toLowerCase());
}

export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Numbers stay unquoted only for numeric columns and plain numeric text; everything else is a string literal. */
export function sqlValue(value: CellValue, numericColumn: boolean): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return numericColumn ? String(value) : quoteLiteral(String(value));
  if (typeof value === 'boolean') return value ? '1' : '0';
  return numericColumn && NUMERIC_LITERAL.test(value.trim()) ? value.trim() : quoteLiteral(value);
}

export function formatIdentifier(name: string, dialect: SqlDialect): string {
  if (SIMPLE_IDENT.test(name)) return name;
  return dialect === 'mssql' ? `[${name.replace(/]/g, ']]')}]` : `"${name.replace(/"/g, '""')}"`;
}

export interface ValueCondition {
  column: string;
  value: CellValue;
  numeric: boolean;
}

export function buildCondition(c: ValueCondition, dialect: SqlDialect): string {
  const col = formatIdentifier(c.column, dialect);
  return c.value === null ? `${col} IS NULL` : `${col} = ${sqlValue(c.value, c.numeric)}`;
}

export function buildWhere(conditions: ValueCondition[], dialect: SqlDialect): string {
  if (conditions.length === 0) return '';
  return `WHERE ${conditions.map((c) => buildCondition(c, dialect)).join('\n  AND ')}`;
}

/** SELECT * FROM <table> WHERE <conditions>. Table left unqualified: the companion adds the schema. */
export function buildSelectWhere(table: string, conditions: ValueCondition[], dialect: SqlDialect): string {
  const where = buildWhere(conditions, dialect);
  return `SELECT *\nFROM ${formatIdentifier(table, dialect)}${where ? `\n${where}` : ''}`;
}

export function buildTopRows(table: string, rows: number, dialect: SqlDialect, columns?: string[]): string {
  const n = Math.max(1, Math.floor(rows));
  const cols = columns && columns.length ? columns.map((c) => formatIdentifier(c, dialect)).join(',\n       ') : '*';
  const t = formatIdentifier(table, dialect);
  return dialect === 'mssql' ? `SELECT TOP ${n} ${cols}\nFROM ${t}` : `SELECT ${cols}\nFROM ${t}\nFETCH FIRST ${n} ROWS ONLY`;
}

/**
 * Query on the other side of a relation, using values of the current record.
 * outgoing: current record is fromTable -> select toTable. incoming: current record is toTable -> select fromTable.
 */
export function buildRelationQuery(
  relation: X3Relation,
  record: Record<string, CellValue>,
  dialect: SqlDialect,
  isNumeric: (table: string, column: string) => boolean = () => false,
): string | null {
  const outgoing = relation.direction === 'outgoing';
  const sourceCols = outgoing ? relation.fromColumns : relation.toColumns;
  const targetCols = outgoing ? relation.toColumns : relation.fromColumns;
  const targetTable = outgoing ? relation.toTable : relation.fromTable;
  if (sourceCols.length === 0 || sourceCols.length !== targetCols.length) return null;
  const conditions: ValueCondition[] = [];
  for (let i = 0; i < sourceCols.length; i++) {
    const src = sourceCols[i] as string;
    const value = lookup(record, src);
    if (value === undefined) return null;
    const target = targetCols[i] as string;
    conditions.push({ column: target, value, numeric: isNumeric(targetTable, target) });
  }
  return buildSelectWhere(targetTable, conditions, dialect);
}

function lookup(record: Record<string, CellValue>, column: string): CellValue | undefined {
  if (column in record) return record[column];
  const key = Object.keys(record).find((k) => k.toUpperCase() === column.toUpperCase());
  return key === undefined ? undefined : record[key];
}
