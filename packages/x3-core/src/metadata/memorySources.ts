import type { CatalogColumn, CatalogIndexColumn, CatalogSource, CatalogTable, DictFilter, DictRow, DictSource } from './sources';

/**
 * In-memory sources. Used by the StaticMetadataProvider (x3-context CSV files loaded by the companion)
 * and by tests. Contain no X3 knowledge by themselves.
 */
export class MemoryCatalogSource implements CatalogSource {
  private readonly columnsByTable = new Map<string, CatalogColumn[]>();

  constructor(
    private readonly tables: CatalogTable[],
    private readonly columns: CatalogColumn[],
    private readonly indexes: CatalogIndexColumn[],
    readonly kind: CatalogSource['kind'] = 'x3-context-files',
  ) {
    for (const c of columns) {
      const k = c.table.toUpperCase();
      const list = this.columnsByTable.get(k) ?? [];
      list.push(c);
      this.columnsByTable.set(k, list);
    }
  }

  async listTables(): Promise<CatalogTable[]> {
    return this.tables;
  }

  async getColumns(table: string): Promise<CatalogColumn[]> {
    return [...(this.columnsByTable.get(table.toUpperCase()) ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  }

  async getAllIndexes(): Promise<CatalogIndexColumn[]> {
    return this.indexes;
  }

  async findColumns(name: string, mode: 'exact' | 'contains', limit: number): Promise<CatalogColumn[]> {
    const q = name.toUpperCase();
    const out: CatalogColumn[] = [];
    for (const c of this.columns) {
      const n = c.name.toUpperCase();
      if (mode === 'exact' ? n === q : n.includes(q)) {
        out.push(c);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}

export class MemoryDictSource implements DictSource {
  private readonly byTable = new Map<string, { columns: string[]; rows: DictRow[] }>();

  constructor(
    tables: Record<string, { columns: string[]; rows: DictRow[] }>,
    readonly kind: DictSource['kind'] = 'x3-context-files',
  ) {
    for (const [name, t] of Object.entries(tables)) this.byTable.set(name.toUpperCase(), t);
  }

  async getColumns(table: string): Promise<string[] | null> {
    return this.byTable.get(table.toUpperCase())?.columns ?? null;
  }

  async select(table: string, columns: string[], where: DictFilter[], limit?: number): Promise<DictRow[]> {
    const t = this.byTable.get(table.toUpperCase());
    if (!t) return [];
    const out: DictRow[] = [];
    for (const r of t.rows) {
      if (!where.every((f) => matches(r, f))) continue;
      out.push(Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));
      if (limit !== undefined && out.length >= limit) break;
    }
    return out;
  }
}

function norm(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim().toUpperCase();
}

function matches(row: DictRow, f: DictFilter): boolean {
  const v = norm(row[f.column]);
  switch (f.op) {
    case 'eq':
      return v === norm(f.value);
    case 'in':
      return f.values.some((x) => norm(x) === v);
    case 'like':
      return likeToRegExp(f.value).test(v);
  }
}

/**
 * DictFilter "like" pattern to a case-insensitive anchored regular expression.
 * Only % is a wildcard: "_" is literal because X3 names contain it (BPCNUM_0).
 */
export function likeToRegExp(pattern: string): RegExp {
  const body = pattern
    .toUpperCase()
    .split('')
    .map((ch) => (ch === '%' ? '.*' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return new RegExp(`^${body}$`, 's');
}
