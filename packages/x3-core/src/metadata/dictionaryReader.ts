import type { DictionaryBlockName, DictionaryStatus } from '@x3i/shared';
import { parseColumnName } from './conventions';
import type { DictionaryMapping } from './dictionary/mapping';
import { probeDictionary, type ResolvedBlock, type ResolvedDictionary } from './dictionary/probe';
import type { DictFilter, DictRow, DictSource, Logger } from './sources';
import { asCode, asText } from './text';

/** Logical filter: logical column -> value (eq), values (in) or pattern (like). */
export type LogicalFilter =
  | { col: string; op: 'eq'; value: string | number }
  | { col: string; op: 'in'; values: Array<string | number> }
  | { col: string; op: 'like'; value: string };

/**
 * Reads X3 dictionary tables through the probed mapping. Callers use logical column names
 * ("table", "field", "label"); only resolved physical columns are ever queried.
 */
export class DictionaryReader {
  private probeP: Promise<{ resolved: ResolvedDictionary; status: DictionaryStatus }> | undefined;

  constructor(
    private readonly source: DictSource | undefined,
    private readonly mapping: DictionaryMapping,
    private readonly providerName: string,
    private readonly language: string,
    private readonly logger: Logger,
  ) {}

  probe(): Promise<{ resolved: ResolvedDictionary; status: DictionaryStatus }> {
    this.probeP ??= probeDictionary(this.mapping, this.source, this.providerName).then((r) => {
      const usable = r.status.blocks.filter((b) => b.usable).map((b) => b.block);
      this.logger.info(`dictionary probe: ${usable.length}/${r.status.blocks.length} blocks usable`, { usable });
      return r;
    });
    return this.probeP;
  }

  reset(): void {
    this.probeP = undefined;
  }

  async block(name: DictionaryBlockName): Promise<ResolvedBlock | undefined> {
    const b = (await this.probe()).resolved[name];
    return b.usable ? b : undefined;
  }

  async isUsable(name: DictionaryBlockName): Promise<boolean> {
    return (await this.block(name)) !== undefined;
  }

  /** Why a block cannot be used, for "Unknown" explanations. */
  async unusableReason(name: DictionaryBlockName): Promise<string> {
    const st = (await this.probe()).status.blocks.find((b) => b.block === name);
    if (!st) return `dictionary block ${name} not mapped`;
    if (!this.source) return 'no X3 dictionary source configured';
    if (!st.tablePresent) return `dictionary table ${st.table} not found in the schema`;
    return `dictionary mapping not resolved: ${st.missingRequired.map((c) => `${st.table}.${c}`).join(', ')}`;
  }

  /**
   * Selects rows of a block. Returns rows keyed by logical column name. Logical columns that are
   * not resolved are silently omitted (callers treat them as unknown).
   */
  async select(name: DictionaryBlockName, cols: string[], filters: LogicalFilter[], limit?: number): Promise<Array<Record<string, unknown>>> {
    const b = await this.block(name);
    if (!b || !this.source) return [];
    const phys: Array<[string, string]> = cols.filter((c) => b.cols[c]).map((c) => [c, b.cols[c] as string]);
    const where: DictFilter[] = [];
    for (const f of filters) {
      const column = b.cols[f.col];
      if (!column) return []; // filtering on an unresolved column: no reliable answer
      where.push(f.op === 'in' ? { column, op: 'in', values: f.values } : { column, op: f.op, value: f.value } as DictFilter);
    }
    if (phys.length === 0) return [];
    let rows: DictRow[];
    try {
      rows = await this.source.select(b.table, phys.map(([, p]) => p), where, limit);
    } catch (e) {
      this.logger.warn(`dictionary query failed on ${b.table}`, { error: (e as Error).message });
      return [];
    }
    return rows.map((r) => Object.fromEntries(phys.map(([logical, p]) => [logical, r[p] ?? null])));
  }

  /**
   * Translated texts of a block's text column, keyed by "IDENT1|IDENT2" (upper case).
   * Returns an empty map when the translations block is not usable.
   */
  async translations(name: DictionaryBlockName, ident1?: string, ident2In?: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const b = await this.block(name);
    const tr = await this.block('translations');
    const textCol = b?.mapping.textColumn;
    if (!b || !tr || !textCol || !b.cols[textCol]) return out;
    const zone = parseColumnName(b.cols[textCol] as string).field;
    const filters: LogicalFilter[] = [
      { col: 'dictTable', op: 'eq', value: b.table },
      { col: 'zone', op: 'eq', value: zone },
      { col: 'language', op: 'eq', value: this.language },
    ];
    if (ident1 !== undefined) filters.push({ col: 'ident1', op: 'eq', value: ident1 });
    if (ident2In && ident2In.length) filters.push({ col: 'ident2', op: 'in', values: ident2In });
    const rows = await this.select('translations', ['ident1', 'ident2', 'text'], filters);
    for (const r of rows) {
      const text = asText(r.text);
      const k1 = asCode(r.ident1);
      if (!text || !k1) continue;
      out.set(`${k1.toUpperCase()}|${(asCode(r.ident2) ?? '').toUpperCase()}`, text);
    }
    return out;
  }

  /** Texts matching a pattern in translations of a block (search by label). */
  async searchTranslations(name: DictionaryBlockName, pattern: string, limit: number): Promise<Array<{ ident1: string; ident2: string; text: string }>> {
    const b = await this.block(name);
    const tr = await this.block('translations');
    const textCol = b?.mapping.textColumn;
    if (!b || !tr || !textCol || !b.cols[textCol]) return [];
    const zone = parseColumnName(b.cols[textCol] as string).field;
    const rows = await this.select(
      'translations',
      ['ident1', 'ident2', 'text'],
      [
        { col: 'dictTable', op: 'eq', value: b.table },
        { col: 'zone', op: 'eq', value: zone },
        { col: 'language', op: 'eq', value: this.language },
        { col: 'text', op: 'like', value: pattern },
      ],
      limit,
    );
    return rows
      .map((r) => ({ ident1: asCode(r.ident1) ?? '', ident2: asCode(r.ident2) ?? '', text: asText(r.text) ?? '' }))
      .filter((r) => r.ident1 && r.text);
  }

  get lang(): string {
    return this.language;
  }
}
