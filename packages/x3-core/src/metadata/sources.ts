import type { SourceKind } from '@x3i/shared';

/** Physical structure of the folder schema. Implemented on the SQL catalog or on x3-context files. */
export interface CatalogTable {
  name: string;
  rowCount: number | null;
}

export interface CatalogColumn {
  table: string;
  name: string;
  ordinal: number;
  dataType: string;
  length: number | null;
  precision: number | null;
  scale: number | null;
  nullable: boolean;
}

export interface CatalogIndexColumn {
  table: string;
  index: string;
  unique: boolean;
  primary: boolean;
  ordinal: number;
  column: string;
}

export interface CatalogSource {
  readonly kind: Extract<SourceKind, 'sql-catalog' | 'x3-context-files'>;
  listTables(): Promise<CatalogTable[]>;
  getColumns(table: string): Promise<CatalogColumn[]>;
  /** All index columns of the schema (used for abbreviations, keys and relation inference). */
  getAllIndexes(): Promise<CatalogIndexColumn[]>;
  /** Columns whose name matches, across all tables. mode "exact" compares case-insensitively. */
  findColumns(name: string, mode: 'exact' | 'contains', limit: number): Promise<CatalogColumn[]>;
}

export type DictValue = string | number | null;
export type DictRow = Record<string, DictValue>;

export type DictFilter =
  | { column: string; op: 'eq'; value: string | number }
  | { column: string; op: 'in'; values: Array<string | number> }
  | { column: string; op: 'like'; value: string }; // case-insensitive; only % is a wildcard, "_" is literal

/**
 * Read access to X3 dictionary tables. Column names passed here are always physical names
 * already resolved by the probe; implementations must still treat them as untrusted identifiers.
 */
export interface DictSource {
  readonly kind: Extract<SourceKind, 'x3-dictionary' | 'x3-context-files'>;
  /** Physical columns of a dictionary table, or null when the table does not exist. */
  getColumns(table: string): Promise<string[] | null>;
  select(table: string, columns: string[], where: DictFilter[], limit?: number): Promise<DictRow[]>;
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
