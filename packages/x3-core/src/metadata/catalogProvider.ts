import {
  attr,
  known,
  unknown,
  type DictionaryStatus,
  type Sourced,
  type X3Field,
  type X3FieldHit,
  type X3FieldUsage,
  type X3Index,
  type X3LocalMenu,
  type X3PhysicalColumn,
  type X3Relation,
  type X3ScreenFieldHit,
  type X3SearchResult,
  type X3Table,
  type X3TableSummary,
} from '@x3i/shared';
import { CatalogIndex } from './catalogIndex';
import {
  DEFAULT_TECHNICAL_FIELDS,
  classifyCustom,
  groupColumns,
  indexCodeFromName,
  isTechnicalField,
  objectFromFunction,
  parseColumnName,
} from './conventions';
import { DEFAULT_DICTIONARY_MAPPING, type DictionaryMapping } from './dictionary/mapping';
import { DictionaryReader } from './dictionaryReader';
import type { PageResolution, PageResolutionInput, X3MetadataProvider } from './providers';
import { computeRelations } from './relations';
import { silentLogger, type CatalogColumn, type CatalogSource, type DictSource, type Logger } from './sources';
import { asCode, asNumber, asText, normalizeText } from './text';

export interface CatalogProviderOptions {
  name: string;
  catalog: CatalogSource;
  dict?: DictSource;
  mapping?: DictionaryMapping;
  /** X3 language code used for labels (FRA, ENG...). */
  language: string;
  technicalFields?: readonly string[];
  logger?: Logger;
}

interface TableDictInfo {
  abbreviation?: string;
  description?: string;
  activity?: string;
  module?: string;
}

/**
 * Metadata provider built on two abstract sources:
 * - the physical catalog (verifiable, EXACT), with X3 conventions on top (INFERRED);
 * - the X3 dictionary through a probed mapping (METADATA), optional.
 * DatabaseMetadataProvider and StaticMetadataProvider are this class with SQL or file sources.
 */
export class CatalogMetadataProvider implements X3MetadataProvider {
  readonly name: string;
  readonly catalog: CatalogIndex;
  readonly dict: DictionaryReader;
  private readonly technical: readonly string[];
  private readonly logger: Logger;
  private readonly catalogKind: CatalogSource['kind'];
  private readonly dictKind: 'x3-dictionary' | 'x3-context-files';
  private summariesP: Promise<X3TableSummary[]> | undefined;
  private tableDictP: Promise<Map<string, TableDictInfo>> | undefined;
  private typesP: Promise<Map<string, string>> | undefined;
  private readonly tableCache = new Map<string, Promise<X3Table | null>>();

  constructor(options: CatalogProviderOptions) {
    this.name = options.name;
    this.logger = options.logger ?? silentLogger;
    this.catalog = new CatalogIndex(options.catalog);
    this.catalogKind = options.catalog.kind;
    this.dictKind = options.dict?.kind ?? 'x3-dictionary';
    this.dict = new DictionaryReader(options.dict, options.mapping ?? DEFAULT_DICTIONARY_MAPPING, options.name, options.language, this.logger);
    this.technical = options.technicalFields ?? DEFAULT_TECHNICAL_FIELDS;
  }

  async refresh(): Promise<void> {
    this.catalog.reset();
    this.dict.reset();
    this.summariesP = undefined;
    this.tableDictP = undefined;
    this.typesP = undefined;
    this.tableCache.clear();
  }

  getDictionaryStatus(): Promise<DictionaryStatus> {
    return this.dict.probe().then((p) => p.status);
  }

  async resolveTableName(name: string): Promise<string | undefined> {
    return (await this.catalog.table(name))?.name;
  }

  // ---------------------------------------------------------------- tables

  private tableDict(): Promise<Map<string, TableDictInfo>> {
    this.tableDictP ??= (async () => {
      const map = new Map<string, TableDictInfo>();
      if (!(await this.dict.isUsable('tables'))) return map;
      const [rows, texts] = await Promise.all([
        this.dict.select('tables', ['table', 'abbreviation', 'description', 'activity', 'module'], []),
        this.dict.translations('tables'),
      ]);
      for (const r of rows) {
        const t = asCode(r.table);
        if (!t) continue;
        const info: TableDictInfo = {};
        const abbr = asCode(r.abbreviation);
        const desc = texts.get(`${t.toUpperCase()}|`) ?? asText(r.description);
        const act = asCode(r.activity);
        const mod = asCode(r.module);
        if (abbr) info.abbreviation = abbr;
        if (desc) info.description = desc;
        if (act) info.activity = act;
        if (mod) info.module = mod;
        map.set(t.toUpperCase(), info);
      }
      return map;
    })();
    return this.tableDictP;
  }

  private types(): Promise<Map<string, string>> {
    this.typesP ??= (async () => {
      const map = new Map<string, string>();
      const rows = await this.dict.select('types', ['type', 'linkedTable'], []);
      for (const r of rows) {
        const type = asCode(r.type);
        const table = asCode(r.linkedTable);
        if (type && table) map.set(type.toUpperCase(), table);
      }
      return map;
    })();
    return this.typesP;
  }

  private summaries(): Promise<X3TableSummary[]> {
    this.summariesP ??= (async () => {
      const [tables, dict] = await Promise.all([this.catalog.tables(), this.tableDict()]);
      const out: X3TableSummary[] = [];
      for (const t of tables) {
        const info = dict.get(t.name.toUpperCase());
        const key = await this.catalog.key(t.name);
        const s: X3TableSummary = { name: t.name, rowCount: t.rowCount, custom: classifyCustom(t.name, info?.activity) };
        if (info?.abbreviation) s.abbreviation = attr(info.abbreviation, this.dictKind, 'METADATA', 'table dictionary');
        else if (key?.abbreviation) s.abbreviation = key.abbreviation;
        if (info?.description) s.description = attr(info.description, this.dictKind, 'METADATA', 'table dictionary');
        out.push(s);
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    })();
    this.summariesP.catch(() => {
      this.summariesP = undefined;
    });
    return this.summariesP;
  }

  async searchTables(query: string, limit = 50): Promise<X3TableSummary[]> {
    const all = await this.summaries();
    const q = normalizeText(query);
    if (!q) return all.slice(0, limit);
    const scored: Array<[number, X3TableSummary]> = [];
    for (const t of all) {
      const name = t.name.toUpperCase();
      const abbr = t.abbreviation?.value.toUpperCase();
      const desc = t.description ? normalizeText(t.description.value) : '';
      let score = 0;
      if (name === q) score = 100;
      else if (abbr === q) score = 90;
      else if (name.startsWith(q)) score = 80;
      else if (abbr?.startsWith(q)) score = 70;
      else if (name.includes(q)) score = 50;
      else if (desc.includes(q)) score = 40;
      if (score) scored.push([score, t]);
    }
    return scored
      .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))
      .slice(0, limit)
      .map(([, t]) => t);
  }

  getTable(name: string): Promise<X3Table | null> {
    const k = name.toUpperCase();
    let p = this.tableCache.get(k);
    if (!p) {
      p = this.buildTable(name);
      this.tableCache.set(k, p);
      p.catch(() => this.tableCache.delete(k));
    }
    return p;
  }

  async getFields(table: string): Promise<X3Field[]> {
    return (await this.getTable(table))?.fields ?? [];
  }

  private async buildTable(name: string): Promise<X3Table | null> {
    const cat = await this.catalog.table(name);
    if (!cat) return null;
    const tableName = cat.name;
    const unknowns: string[] = [];
    const [columns, indexes, key, summaries, dictInfo] = await Promise.all([
      this.catalog.source.getColumns(tableName),
      this.catalog.indexes(tableName),
      this.catalog.key(tableName),
      this.summaries(),
      this.tableDict().then((m) => m.get(tableName.toUpperCase())),
    ]);
    const summary = summaries.find((s) => s.name === tableName) ?? { name: tableName, rowCount: cat.rowCount, custom: classifyCustom(tableName) };

    const fieldsUsable = await this.dict.isUsable('fields');
    if (!fieldsUsable) unknowns.push(`field labels and X3 types: ${await this.dict.unusableReason('fields')}`);
    if (!(await this.dict.isUsable('tables'))) unknowns.push(`description, module, activity code: ${await this.dict.unusableReason('tables')}`);
    if (!key) unknowns.push('primary key: no unique index following the X3 convention <TABLE>_<ABR>0 and no SQL primary key');

    const fieldDict = fieldsUsable ? await this.fieldDictionary(tableName) : new Map<string, Record<string, unknown>>();
    const types = fieldsUsable ? await this.types() : new Map<string, string>();
    const keyCols = new Set((key?.columns ?? []).map((c) => c.toUpperCase()));

    const fields = groupColumns(columns.map(toPhysical)).map((g): X3Field => {
      const first = g.columns[0] as X3PhysicalColumn;
      const d = fieldDict.get(g.field.toUpperCase());
      const activity = asCode(d?.activity);
      const f: X3Field = {
        name: g.field,
        table: tableName,
        columns: g.columns,
        dimension: g.columns.length,
        technical: isTechnicalField(g.field, this.technical),
        isKey: g.columns.some((c) => keyCols.has(c.name.toUpperCase())),
        sqlType: first.sqlType,
        length: first.length,
        custom: classifyCustom(g.field, activity),
        prov: { source: this.catalogKind, confidence: 'EXACT', detail: 'physical columns' },
      };
      if (d) {
        const meta = (v: string) => ({ source: this.dictKind, confidence: 'METADATA' as const, detail: v });
        const label = asText(d.label);
        const type = asCode(d.x3Type);
        const len = asNumber(d.length);
        const menu = asNumber(d.localMenu);
        if (label) f.label = { value: label, prov: meta('field dictionary') };
        if (type) {
          f.x3Type = { value: type, prov: meta('field dictionary') };
          const linked = types.get(type.toUpperCase());
          if (linked) f.linkedTable = { value: linked, prov: meta(`type ${type} -> table ${linked}`) };
        }
        if (len !== undefined) f.x3Length = { value: len, prov: meta('field dictionary') };
        if (menu !== undefined && menu > 0) f.localMenu = { value: menu, prov: meta('field dictionary') };
        if (activity) f.activityCode = { value: activity, prov: meta('field dictionary') };
      }
      return f;
    });

    const x3Indexes: X3Index[] = indexes.map((i) => {
      const code = indexCodeFromName(tableName, i.name);
      const idx: X3Index = {
        name: i.name,
        unique: i.unique,
        primary: key?.indexName === i.name,
        columns: i.columns,
        fields: [...new Set(i.columns.map((c) => parseColumnName(c).field))],
        prov: { source: this.catalogKind, confidence: 'EXACT', detail: 'SQL index' },
      };
      if (code) idx.code = attr(code, 'x3-convention', 'INFERRED', 'index name <TABLE>_<CODE>');
      return idx;
    });

    const table: X3Table = { ...summary, fields, indexes: x3Indexes, unknowns };
    if (key) table.primaryKey = { value: key.columns, prov: key.prov };
    if (dictInfo?.module) table.module = attr(dictInfo.module, this.dictKind, 'METADATA', 'table dictionary');
    if (dictInfo?.activity) table.activityCode = attr(dictInfo.activity, this.dictKind, 'METADATA', 'table dictionary');
    return table;
  }

  /** Field dictionary rows of a table keyed by field (upper), labels replaced by translations when available. */
  private async fieldDictionary(table: string): Promise<Map<string, Record<string, unknown>>> {
    const [rows, texts] = await Promise.all([
      this.dict.select('fields', ['field', 'x3Type', 'length', 'dimension', 'label', 'localMenu', 'activity'], [{ col: 'table', op: 'eq', value: table }]),
      this.dict.translations('fields', table),
    ]);
    const map = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const f = asCode(r.field);
      if (!f) continue;
      const tr = texts.get(`${table.toUpperCase()}|${f.toUpperCase()}`);
      map.set(f.toUpperCase(), tr ? { ...r, label: tr } : r);
    }
    return map;
  }

  // ---------------------------------------------------------------- relations, menus

  async getRelations(table: string): Promise<X3Relation[]> {
    const t = await this.getTable(table);
    if (!t) return [];
    return computeRelations(t, this);
  }

  async getLocalMenu(menu: number, language?: string): Promise<X3LocalMenu | null> {
    if (!(await this.dict.isUsable('localMenus'))) return null;
    const lang = language ?? this.dict.lang;
    const rows = await this.dict.select(
      'localMenus',
      ['value', 'label'],
      [
        { col: 'menu', op: 'eq', value: menu },
        { col: 'language', op: 'eq', value: lang },
      ],
    );
    const values = rows
      .map((r) => ({ value: asNumber(r.value), label: asText(r.label) ?? asCode(r.label) ?? '' }))
      .filter((v): v is { value: number; label: string } => v.value !== undefined)
      .sort((a, b) => a.value - b.value);
    if (values.length === 0) return null;
    return { menu, language: lang, values, prov: { source: this.dictKind, confidence: 'METADATA', detail: 'local menu dictionary' } };
  }

  // ---------------------------------------------------------------- search, usage

  async search(query: string, limit = 30): Promise<X3SearchResult> {
    const q = query.trim();
    const unavailable: string[] = [];
    const result: X3SearchResult = { query: q, tables: [], fields: [], screens: [], functions: [], unavailable };
    if (!q) return result;

    result.tables = await this.searchTables(q, limit);
    result.fields = await this.searchFields(q, limit, unavailable);

    if (await this.dict.isUsable('screenFields')) {
      const rows = await this.dict.select('screenFields', ['screen', 'field'], [{ col: 'field', op: 'like', value: `%${q}%` }], limit);
      result.screens = rows.map((r) => this.screenHit(r)).filter((h): h is X3ScreenFieldHit => h !== undefined);
    } else {
      unavailable.push(`screens: ${await this.dict.unusableReason('screenFields')}`);
    }

    if (await this.dict.isUsable('functions')) {
      const rows = await this.dict.select('functions', ['function', 'object'], [{ col: 'function', op: 'like', value: `%${q}%` }], limit);
      for (const r of rows) {
        const code = asCode(r.function);
        if (!code) continue;
        const hit: X3SearchResult['functions'][number] = { code, prov: { source: this.dictKind, confidence: 'METADATA' } };
        const obj = asCode(r.object);
        if (obj) hit.object = obj;
        result.functions.push(hit);
      }
    } else {
      unavailable.push(`functions: ${await this.dict.unusableReason('functions')}`);
    }
    return result;
  }

  private async searchFields(q: string, limit: number, unavailable: string[]): Promise<X3FieldHit[]> {
    const hits = new Map<string, X3FieldHit>();
    const cols = await this.catalog.source.findColumns(q, 'contains', limit * 4);
    for (const c of cols) this.addColumnHit(hits, c, 'name');

    if (await this.dict.isUsable('fields')) {
      const byLabel = await this.dict.searchTranslations('fields', `%${q}%`, limit);
      let labelRows = byLabel.map((r) => ({ table: r.ident1, field: r.ident2, label: r.text }));
      if (labelRows.length === 0) {
        const direct = await this.dict.select('fields', ['table', 'field', 'label'], [{ col: 'label', op: 'like', value: `%${q}%` }], limit);
        labelRows = direct
          .map((r) => ({ table: asCode(r.table) ?? '', field: asCode(r.field) ?? '', label: asText(r.label) ?? '' }))
          .filter((r) => r.table && r.field && r.label);
      }
      for (const r of labelRows) {
        const table = await this.resolveTableName(r.table);
        if (!table) continue;
        const k = `${table}.${r.field}`.toUpperCase();
        const existing = hits.get(k);
        const label = attr(r.label, this.dictKind, 'METADATA', 'field dictionary');
        if (existing) existing.label = label;
        else hits.set(k, { table, field: r.field, label, columns: [], custom: classifyCustom(r.field), matchedOn: 'label' });
      }
    } else {
      unavailable.push(`search by label: ${await this.dict.unusableReason('fields')}`);
    }
    return [...hits.values()].slice(0, limit * 2);
  }

  private addColumnHit(hits: Map<string, X3FieldHit>, c: CatalogColumn, matchedOn: 'name' | 'label'): void {
    const field = parseColumnName(c.name).field;
    const k = `${c.table}.${field}`.toUpperCase();
    const existing = hits.get(k);
    if (existing) {
      if (!existing.columns.includes(c.name)) existing.columns.push(c.name);
      return;
    }
    hits.set(k, { table: c.table, field, columns: [c.name], custom: classifyCustom(field), matchedOn });
  }

  private screenHit(r: Record<string, unknown>): X3ScreenFieldHit | undefined {
    const screen = asCode(r.screen);
    const field = asCode(r.field);
    if (!screen || !field) return undefined;
    return { screen, field, prov: { source: this.dictKind, confidence: 'METADATA', detail: 'screen dictionary' } };
  }

  async getFieldUsage(field: string): Promise<X3FieldUsage> {
    const f = parseColumnName(field.trim().toUpperCase()).field;
    const unavailable: string[] = [];
    const hits = new Map<string, X3FieldHit>();
    for (const name of [`${f}_0`, f]) {
      for (const c of await this.catalog.source.findColumns(name, 'exact', 2000)) this.addColumnHit(hits, c, 'name');
    }
    let screens: X3ScreenFieldHit[] = [];
    if (await this.dict.isUsable('screenFields')) {
      const rows = await this.dict.select('screenFields', ['screen', 'field'], [{ col: 'field', op: 'eq', value: f }], 2000);
      screens = rows.map((r) => this.screenHit(r)).filter((h): h is X3ScreenFieldHit => h !== undefined);
    } else {
      unavailable.push(`screens: ${await this.dict.unusableReason('screenFields')}`);
    }
    unavailable.push('functions, windows, objects using the field: not implemented in MVP 1');
    return { field: f, tables: [...hits.values()], screens, unavailable };
  }

  // ---------------------------------------------------------------- page resolution

  async resolvePage(input: PageResolutionInput): Promise<PageResolution> {
    const candidates: string[] = [];
    let object: Sourced<string> = unknown('no function or object detected');
    if (input.object) {
      object = known(input.object.toUpperCase(), 'inference', 'INFERRED', 'object given by the page detection');
    } else if (input.functionCode) {
      const fn = input.functionCode.toUpperCase();
      const rows = await this.dict.select('functions', ['object'], [{ col: 'function', op: 'eq', value: fn }], 1);
      const fromDict = asCode(rows[0]?.object);
      const fromConvention = objectFromFunction(fn);
      if (fromDict) object = known(fromDict.toUpperCase(), this.dictKind, 'METADATA', `function dictionary (${fn})`);
      else if (fromConvention) object = known(fromConvention, 'x3-convention', 'INFERRED', `function ${fn} = GES + object code`);
      else object = unknown(`object of function ${fn}: ${await this.dict.unusableReason('functions')}`);
    }

    let mainTable: Sourced<string> = unknown('object unknown');
    let abbreviation: Sourced<string> = unknown('main table unknown');
    if (object.value) {
      const obj = object.value;
      const rows = await this.dict.select('objects', ['mainTable'], [{ col: 'object', op: 'eq', value: obj }], 1);
      const dictTable = asCode(rows[0]?.mainTable);
      const dictCanonical = dictTable ? await this.resolveTableName(dictTable) : undefined;
      if (dictCanonical) {
        mainTable = known(dictCanonical, this.dictKind, 'METADATA', `object dictionary (${obj})`);
      } else {
        const byAbbr = (await this.summaries()).filter((s) => s.abbreviation?.value.toUpperCase() === obj);
        candidates.push(...byAbbr.map((s) => s.name));
        const only = byAbbr[0];
        if (byAbbr.length === 1 && only?.abbreviation) {
          const conf = only.abbreviation.prov.confidence === 'METADATA' ? 'METADATA' : 'INFERRED';
          mainTable = known(only.name, only.abbreviation.prov.source, conf, `table whose abbreviation is ${obj} (object code = table abbreviation)`);
        } else if (byAbbr.length > 1) {
          mainTable = unknown(`several tables have the abbreviation ${obj}: ${candidates.join(', ')}`);
        } else {
          mainTable = unknown(`no table with abbreviation ${obj}; object dictionary: ${await this.dict.unusableReason('objects')}`);
        }
      }
    }
    if (mainTable.value) {
      const s = (await this.summaries()).find((x) => x.name === mainTable.value);
      if (s?.abbreviation) abbreviation = { value: s.abbreviation.value, prov: s.abbreviation.prov };
    }
    return { object, mainTable, abbreviation, candidates };
  }
}

function toPhysical(c: CatalogColumn): X3PhysicalColumn {
  return {
    name: c.name,
    dimIndex: parseColumnName(c.name).dimIndex,
    ordinal: c.ordinal,
    sqlType: c.dataType,
    length: c.length,
    precision: c.precision,
    scale: c.scale,
    nullable: c.nullable,
  };
}

