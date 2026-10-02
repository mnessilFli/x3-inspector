import type { DictionaryBlockName, DictionaryBlockStatus, DictionaryStatus } from '@x3i/shared';
import type { DictSource } from '../sources';
import type { DictBlockMapping, DictionaryMapping } from './mapping';

export interface ResolvedBlock {
  block: DictionaryBlockName;
  table: string;
  /** Logical column -> physical column. Only resolved columns are present. */
  cols: Record<string, string>;
  usable: boolean;
  mapping: DictBlockMapping;
}

export type ResolvedDictionary = Record<DictionaryBlockName, ResolvedBlock>;

/** Finds the physical column of a candidate: CODFIC_0 is preferred over CODFIC (X3 suffix convention). */
export function resolveColumn(candidates: string[], actual: string[]): string | null {
  const byUpper = new Map(actual.map((c) => [c.toUpperCase(), c]));
  for (const cand of candidates) {
    const u = cand.toUpperCase();
    const hit = byUpper.get(`${u}_0`) ?? byUpper.get(u);
    if (hit) return hit;
  }
  return null;
}

export async function probeDictionary(
  mapping: DictionaryMapping,
  source: DictSource | undefined,
  providerName: string,
): Promise<{ resolved: ResolvedDictionary; status: DictionaryStatus }> {
  const resolved = {} as ResolvedDictionary;
  const blocks: DictionaryBlockStatus[] = [];

  for (const [block, m] of Object.entries(mapping) as Array<[DictionaryBlockName, DictBlockMapping]>) {
    const actual = source ? await source.getColumns(m.table) : null;
    const cols: Record<string, string> = {};
    const report: Record<string, string | null> = {};
    for (const [logical, candidates] of Object.entries(m.columns)) {
      const phys = actual ? resolveColumn(candidates, actual) : null;
      report[logical] = phys;
      if (phys) cols[logical] = phys;
    }
    const missingRequired = m.required.filter((r) => !cols[r]);
    const usable = actual !== null && missingRequired.length === 0;
    resolved[block] = { block, table: m.table, cols, usable, mapping: m };
    blocks.push({
      block,
      table: m.table,
      tablePresent: actual !== null,
      resolved: report,
      missingRequired,
      usable,
      status: m.status,
      actualColumns: actual ?? [],
    });
  }

  return { resolved, status: { provider: providerName, probedAt: new Date().toISOString(), blocks } };
}
