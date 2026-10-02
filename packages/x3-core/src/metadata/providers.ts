import type {
  CellValue,
  DatabaseInfo,
  DatabaseType,
  DictionaryStatus,
  QueryColumn,
  QueryResult,
  RecordRequest,
  RecordResult,
  Sourced,
  SqlValidation,
  X3Field,
  X3FieldUsage,
  X3LocalMenu,
  X3Relation,
  X3SearchResult,
  X3Table,
  X3TableSummary,
} from '@x3i/shared';

export interface PageResolutionInput {
  functionCode?: string | null;
  object?: string | null;
  screen?: string | null;
}

export interface PageResolution {
  object: Sourced<string>;
  mainTable: Sourced<string>;
  abbreviation: Sourced<string>;
  /** Tables that could match when the main table is ambiguous. */
  candidates: string[];
}

/**
 * Tables, fields, keys, relations, local menus, search. Implementations:
 * - CatalogMetadataProvider over SQL sources (DatabaseMetadataProvider)
 * - CatalogMetadataProvider over x3-context files (StaticMetadataProvider)
 * - X3ApiMetadataProvider (GraphQL): planned
 */
export interface X3MetadataProvider {
  readonly name: string;
  searchTables(query: string, limit?: number): Promise<X3TableSummary[]>;
  getTable(name: string): Promise<X3Table | null>;
  getFields(table: string): Promise<X3Field[]>;
  getRelations(table: string): Promise<X3Relation[]>;
  getLocalMenu(menu: number, language?: string): Promise<X3LocalMenu | null>;
  search(query: string, limit?: number): Promise<X3SearchResult>;
  getFieldUsage(field: string): Promise<X3FieldUsage>;
  resolvePage(input: PageResolutionInput): Promise<PageResolution>;
  /** Canonical table name when it exists in the folder schema. */
  resolveTableName(name: string): Promise<string | undefined>;
  getDictionaryStatus(): Promise<DictionaryStatus>;
  refresh(): Promise<void>;
}

export interface QueryOptions {
  maxRows: number;
  timeoutMs: number;
}

/** Executes validated read-only queries. */
export interface X3QueryProvider {
  validate(sql: string): SqlValidation;
  execute(sql: string, options: QueryOptions): Promise<QueryResult>;
  readRecord(request: RecordRequest, options: QueryOptions): Promise<RecordResult>;
}

export interface DbQueryResult {
  columns: QueryColumn[];
  rows: Array<Record<string, CellValue>>;
  truncated: boolean;
}

export type SqlParams = Record<string, string | number | null>;

/** Database access. Every statement runs in a transaction that is always rolled back / read only. */
export interface X3ConnectionProvider {
  readonly type: DatabaseType;
  readonly info: DatabaseInfo;
  runReadOnly(sql: string, params: SqlParams, options: QueryOptions): Promise<DbQueryResult>;
  /** SQL Server: true when the login is db_owner or db_datawriter. null when it cannot be determined. */
  checkWriteAccess(): Promise<boolean | null>;
  close(): Promise<void>;
}

/** Named parameter placeholder for the dialect: @p0 (SQL Server) or :p0 (Oracle). */
export function paramPlaceholder(type: DatabaseType, name: string): string {
  return type === 'mssql' ? `@${name}` : `:${name}`;
}
