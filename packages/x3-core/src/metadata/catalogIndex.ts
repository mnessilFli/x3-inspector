import { inferPrimaryKey, type IndexLike, type KeyInference } from './conventions';
import type { CatalogSource, CatalogTable } from './sources';

interface Loaded {
  tables: CatalogTable[];
  byUpper: Map<string, CatalogTable>;
  indexesByTable: Map<string, IndexLike[]>;
  keys: Map<string, KeyInference>;
  /** Single-column key column (upper) -> tables whose inferred key is that column. */
  tablesByKeyColumn: Map<string, string[]>;
}

/** Cached view of the physical catalog: tables, indexes, inferred keys. */
export class CatalogIndex {
  private loadedP: Promise<Loaded> | undefined;

  constructor(private readonly catalog: CatalogSource) {}

  get source(): CatalogSource {
    return this.catalog;
  }

  reset(): void {
    this.loadedP = undefined;
  }

  private load(): Promise<Loaded> {
    this.loadedP ??= (async () => {
      const [tables, indexCols] = await Promise.all([this.catalog.listTables(), this.catalog.getAllIndexes()]);
      const byUpper = new Map(tables.map((t) => [t.name.toUpperCase(), t]));
      const grouped = new Map<string, Map<string, IndexLike & { cols: Array<[number, string]> }>>();
      for (const c of indexCols) {
        const tKey = c.table.toUpperCase();
        const perTable = grouped.get(tKey) ?? new Map();
        const idx = perTable.get(c.index) ?? { name: c.index, unique: c.unique, primary: c.primary, columns: [], cols: [] };
        idx.cols.push([c.ordinal, c.column]);
        perTable.set(c.index, idx);
        grouped.set(tKey, perTable);
      }
      const indexesByTable = new Map<string, IndexLike[]>();
      for (const [t, perTable] of grouped) {
        indexesByTable.set(
          t,
          [...perTable.values()].map((i) => ({
            name: i.name,
            unique: i.unique,
            primary: i.primary,
            columns: i.cols.sort((a, b) => a[0] - b[0]).map(([, col]) => col),
          })),
        );
      }
      const keys = new Map<string, KeyInference>();
      const tablesByKeyColumn = new Map<string, string[]>();
      for (const t of tables) {
        const key = inferPrimaryKey(t.name, indexesByTable.get(t.name.toUpperCase()) ?? []);
        if (!key) continue;
        keys.set(t.name.toUpperCase(), key);
        if (key.columns.length === 1) {
          const col = (key.columns[0] as string).toUpperCase();
          const list = tablesByKeyColumn.get(col) ?? [];
          list.push(t.name);
          tablesByKeyColumn.set(col, list);
        }
      }
      return { tables, byUpper, indexesByTable, keys, tablesByKeyColumn };
    })();
    this.loadedP.catch(() => {
      this.loadedP = undefined; // retry on next call after a failure
    });
    return this.loadedP;
  }

  async tables(): Promise<CatalogTable[]> {
    return (await this.load()).tables;
  }

  async table(name: string): Promise<CatalogTable | undefined> {
    return (await this.load()).byUpper.get(name.toUpperCase());
  }

  async indexes(table: string): Promise<IndexLike[]> {
    return (await this.load()).indexesByTable.get(table.toUpperCase()) ?? [];
  }

  async key(table: string): Promise<KeyInference | undefined> {
    return (await this.load()).keys.get(table.toUpperCase());
  }

  async tablesKeyedBy(column: string): Promise<string[]> {
    return (await this.load()).tablesByKeyColumn.get(column.toUpperCase()) ?? [];
  }
}
