import fs from 'node:fs';
import path from 'node:path';
import { MemoryCatalogSource, MemoryDictSource, type CatalogColumn, type CatalogIndexColumn, type CatalogTable, type DictRow, type Logger } from '@x3i/x3-core';
import { csvObjects } from './csv';

/**
 * Loads the files produced by the x3-connect skill (x3-context/<profile>/sql/):
 *   tables.csv, columns.csv, indexes.csv : physical catalog (SQL Server or Oracle headers)
 *   dictionary/<TABLE>.csv               : raw content of X3 dictionary tables
 * The CSV headers give the real column names; nothing is assumed about the dictionary here.
 */
export interface X3ContextSources {
  catalog: MemoryCatalogSource;
  dict: MemoryDictSource;
  summary: { tables: number; columns: number; indexColumns: number; dictionaryTables: string[] };
}

export function loadX3Context(contextPath: string, logger: Logger): X3ContextSources {
  const sqlDir = fs.existsSync(path.join(contextPath, 'sql')) ? path.join(contextPath, 'sql') : contextPath;
  const read = (name: string) => {
    const file = path.join(sqlDir, name);
    if (!fs.existsSync(file)) throw new Error(`x3-context file not found: ${file}`);
    return fs.readFileSync(file, 'utf8');
  };

  const tables: CatalogTable[] = csvObjects(read('tables.csv')).objects.map((r) => ({
    name: r.TABLE_NAME ?? '',
    rowCount: r.ROW_COUNT ? Number(r.ROW_COUNT) : null,
  }));

  const columns: CatalogColumn[] = csvObjects(read('columns.csv')).objects.map((r) => ({
    table: r.TABLE_NAME ?? '',
    name: r.COLUMN_NAME ?? '',
    ordinal: Number(r.ORDINAL_POSITION ?? r.COLUMN_ID ?? 0),
    dataType: (r.DATA_TYPE ?? '').toLowerCase(),
    length: num(r.CHARACTER_MAXIMUM_LENGTH ?? r.DATA_LENGTH),
    precision: num(r.NUMERIC_PRECISION ?? r.DATA_PRECISION),
    scale: num(r.NUMERIC_SCALE ?? r.DATA_SCALE),
    nullable: (r.IS_NULLABLE ?? r.NULLABLE) === 'YES' || (r.IS_NULLABLE ?? r.NULLABLE) === 'Y',
  }));

  let indexes: CatalogIndexColumn[] = [];
  try {
    indexes = csvObjects(read('indexes.csv')).objects.map((r) => ({
      table: r.TABLE_NAME ?? '',
      index: r.INDEX_NAME ?? '',
      unique: truthy(r.IS_UNIQUE) || r.UNIQUENESS === 'UNIQUE',
      primary: truthy(r.IS_PRIMARY_KEY ?? r.IS_PRIMARY),
      ordinal: Number(r.KEY_ORDINAL ?? 0),
      column: r.COLUMN_NAME ?? '',
    }));
  } catch (e) {
    logger.warn(`indexes not loaded: ${(e as Error).message}`);
  }

  const dictTables: Record<string, { columns: string[]; rows: DictRow[] }> = {};
  const dictDir = path.join(sqlDir, 'dictionary');
  if (fs.existsSync(dictDir)) {
    for (const file of fs.readdirSync(dictDir).filter((f) => f.toLowerCase().endsWith('.csv'))) {
      const { header, objects } = csvObjects(fs.readFileSync(path.join(dictDir, file), 'utf8'));
      dictTables[path.basename(file, path.extname(file)).toUpperCase()] = { columns: header, rows: objects };
    }
  }

  const summary = { tables: tables.length, columns: columns.length, indexColumns: indexes.length, dictionaryTables: Object.keys(dictTables) };
  logger.info(`x3-context loaded from ${sqlDir}`, summary);
  return {
    catalog: new MemoryCatalogSource(tables, columns, indexes, 'x3-context-files'),
    dict: new MemoryDictSource(dictTables, 'x3-context-files'),
    summary,
  };
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function truthy(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'TRUE';
}
