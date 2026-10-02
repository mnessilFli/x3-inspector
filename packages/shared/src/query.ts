import type { X3Table } from './metadata';

export interface SqlIssue {
  message: string;
  /** Offset in the SQL text, when known. */
  offset?: number;
}

export interface SqlValidation {
  ok: boolean;
  errors: SqlIssue[];
  warnings: SqlIssue[];
}

export interface QueryRequest {
  sql: string;
  maxRows?: number;
}

export interface QueryColumn {
  name: string;
  sqlType?: string;
}

/** JSON-safe cell value: dates as ISO strings, binaries as a placeholder, bigints as strings. */
export type CellValue = string | number | boolean | null;

export interface QueryResult {
  columns: QueryColumn[];
  rows: Array<Record<string, CellValue>>;
  rowCount: number;
  truncated: boolean;
  maxRows: number;
  /** SQL actually sent to the database (after table qualification). */
  executedSql: string;
  durationMs: number;
  warnings: string[];
}

export interface RecordKeyPart {
  column: string;
  value: string | number;
}

export interface RecordRequest {
  table: string;
  key: RecordKeyPart[];
}

export interface RecordResult {
  table: X3Table;
  row: Record<string, CellValue> | null;
  /** Number of rows matching the key (capped at 2): more than 1 means the key is not unique. */
  matches: number;
  executedSql: string;
  durationMs: number;
}
