import type { DatabaseType } from '@x3i/shared';

/**
 * Physical catalog queries. They only use the standard catalogs of each database
 * (INFORMATION_SCHEMA / sys.* for SQL Server, ALL_* for Oracle), never an X3 table.
 * Parameters: s = schema, t = table, q = column name or LIKE pattern (escape character "\"), n = limit.
 */
export interface CatalogQueries {
  tables: string;
  tablesFallback?: string;
  columns: string;
  indexes: string;
  findColumnsExact: string;
  findColumnsLike: string;
}

export const CATALOG_QUERIES: Record<DatabaseType, CatalogQueries> = {
  mssql: {
    tables: `SELECT t.name AS TABLE_NAME, SUM(p.rows) AS ROW_COUNT
             FROM sys.tables t
             JOIN sys.schemas s ON s.schema_id = t.schema_id
             LEFT JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
             WHERE s.name = @s
             GROUP BY t.name`,
    tablesFallback: `SELECT TABLE_NAME, NULL AS ROW_COUNT FROM INFORMATION_SCHEMA.TABLES
                     WHERE TABLE_SCHEMA = @s AND TABLE_TYPE = 'BASE TABLE'`,
    columns: `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS DATA_LENGTH,
                     NUMERIC_PRECISION AS DATA_PRECISION, NUMERIC_SCALE AS DATA_SCALE, IS_NULLABLE AS NULLABLE
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = @s AND TABLE_NAME = @t
              ORDER BY ORDINAL_POSITION`,
    indexes: `SELECT t.name AS TABLE_NAME, i.name AS INDEX_NAME, i.is_unique AS IS_UNIQUE, i.is_primary_key AS IS_PRIMARY,
                     ic.key_ordinal AS KEY_ORDINAL, c.name AS COLUMN_NAME
              FROM sys.indexes i
              JOIN sys.tables t ON t.object_id = i.object_id
              JOIN sys.schemas s ON s.schema_id = t.schema_id
              JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
              JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE s.name = @s AND i.index_id > 0 AND ic.key_ordinal > 0`,
    findColumnsExact: `SELECT TOP (@n) TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS DATA_LENGTH,
                              NUMERIC_PRECISION AS DATA_PRECISION, NUMERIC_SCALE AS DATA_SCALE, IS_NULLABLE AS NULLABLE
                       FROM INFORMATION_SCHEMA.COLUMNS
                       WHERE TABLE_SCHEMA = @s AND UPPER(COLUMN_NAME) = UPPER(@q)
                       ORDER BY TABLE_NAME`,
    findColumnsLike: `SELECT TOP (@n) TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS DATA_LENGTH,
                             NUMERIC_PRECISION AS DATA_PRECISION, NUMERIC_SCALE AS DATA_SCALE, IS_NULLABLE AS NULLABLE
                      FROM INFORMATION_SCHEMA.COLUMNS
                      WHERE TABLE_SCHEMA = @s AND UPPER(COLUMN_NAME) LIKE UPPER(@q) ESCAPE '\\'
                      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  },
  oracle: {
    tables: 'SELECT TABLE_NAME, NUM_ROWS AS ROW_COUNT FROM ALL_TABLES WHERE OWNER = :s',
    columns: `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_ID AS ORDINAL_POSITION, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
              FROM ALL_TAB_COLUMNS WHERE OWNER = :s AND TABLE_NAME = :t ORDER BY COLUMN_ID`,
    indexes: `SELECT i.TABLE_NAME, i.INDEX_NAME, CASE WHEN i.UNIQUENESS = 'UNIQUE' THEN 1 ELSE 0 END AS IS_UNIQUE,
                     CASE WHEN k.CONSTRAINT_NAME IS NULL THEN 0 ELSE 1 END AS IS_PRIMARY,
                     c.COLUMN_POSITION AS KEY_ORDINAL, c.COLUMN_NAME
              FROM ALL_INDEXES i
              JOIN ALL_IND_COLUMNS c ON c.INDEX_OWNER = i.OWNER AND c.INDEX_NAME = i.INDEX_NAME
              LEFT JOIN ALL_CONSTRAINTS k ON k.OWNER = i.OWNER AND k.INDEX_NAME = i.INDEX_NAME AND k.CONSTRAINT_TYPE = 'P'
              WHERE i.OWNER = :s`,
    findColumnsExact: `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_ID AS ORDINAL_POSITION, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
                       FROM ALL_TAB_COLUMNS WHERE OWNER = :s AND UPPER(COLUMN_NAME) = UPPER(:q)
                       ORDER BY TABLE_NAME FETCH FIRST :n ROWS ONLY`,
    findColumnsLike: `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_ID AS ORDINAL_POSITION, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
                      FROM ALL_TAB_COLUMNS WHERE OWNER = :s AND UPPER(COLUMN_NAME) LIKE UPPER(:q) ESCAPE '\\'
                      ORDER BY TABLE_NAME, COLUMN_ID FETCH FIRST :n ROWS ONLY`,
  },
};

/** Escapes LIKE wildcards of user text, then wraps it: "BPCNUM_0" -> "%BPCNUM\_0%". */
export function containsPattern(text: string): string {
  return `%${escapeLike(text)}%`;
}

export function escapeLike(text: string): string {
  return text.replace(/[\\%_[]/g, (c) => `\\${c}`);
}
