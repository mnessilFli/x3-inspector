import { attr, type Attr, type CustomFlag, type X3PhysicalColumn } from '@x3i/shared';

/**
 * X3 naming conventions applied to the SQL catalog. None of them is verified on a real environment
 * in this project yet (see docs/x3-metadata.md, section 3): results are always INFERRED.
 */

const DIM_SUFFIX = /^(.+)_(\d+)$/;

export interface ParsedColumnName {
  field: string;
  dimIndex: number | null;
}

/** BPCNUM_0 -> { field: BPCNUM, dimIndex: 0 }; ZIDSF_OPP_0 -> { field: ZIDSF_OPP, dimIndex: 0 }. */
export function parseColumnName(column: string): ParsedColumnName {
  const m = DIM_SUFFIX.exec(column);
  if (!m) return { field: column, dimIndex: null };
  return { field: m[1] as string, dimIndex: Number(m[2]) };
}

export interface FieldGroup {
  field: string;
  columns: X3PhysicalColumn[];
}

/**
 * Groups FIELD_0..FIELD_n into one logical field. A base is grouped only when its _0 column exists,
 * otherwise each column stays its own field (e.g. a lone CODE_1 column).
 */
export function groupColumns(columns: X3PhysicalColumn[]): FieldGroup[] {
  const byBase = new Map<string, X3PhysicalColumn[]>();
  for (const c of columns) {
    if (c.dimIndex === null) continue;
    const base = parseColumnName(c.name).field.toUpperCase();
    const list = byBase.get(base) ?? [];
    list.push(c);
    byBase.set(base, list);
  }
  const groups: FieldGroup[] = [];
  const seen = new Set<string>();
  for (const c of [...columns].sort((a, b) => a.ordinal - b.ordinal)) {
    const parsed = parseColumnName(c.name);
    const base = parsed.field.toUpperCase();
    const siblings = c.dimIndex !== null ? byBase.get(base) : undefined;
    const grouped = siblings !== undefined && siblings.some((s) => s.dimIndex === 0);
    const key = grouped ? `G:${base}` : `C:${c.name.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (grouped) {
      groups.push({ field: parsed.field, columns: [...(siblings as X3PhysicalColumn[])].sort((a, b) => (a.dimIndex ?? 0) - (b.dimIndex ?? 0)) });
    } else {
      groups.push({ field: c.name, columns: [{ ...c, dimIndex: null }] });
    }
  }
  return groups;
}

export const DEFAULT_TECHNICAL_FIELDS: readonly string[] = [
  'UPDTICK', 'CREDATTIM', 'UPDDATTIM', 'AUUID', 'ROWID', 'CREUSR', 'UPDUSR', 'CREDAT', 'UPDDAT',
];

export function isTechnicalField(field: string, technical: readonly string[] = DEFAULT_TECHNICAL_FIELDS): boolean {
  return technical.includes(field.toUpperCase());
}

const CUSTOM_PREFIX = /^[XYZ]/i;

/**
 * X, Y, Z prefixes are the X3 convention for specific developments. A prefix is never a proof:
 * the result is "custom-suspected" unless an activity code confirms it.
 */
export function classifyCustom(name: string, activityCode?: string): CustomFlag {
  if (activityCode && CUSTOM_PREFIX.test(activityCode)) {
    return { level: 'custom', confidence: 'METADATA', reason: `activity code ${activityCode} is a specific code (X/Y/Z)` };
  }
  if (CUSTOM_PREFIX.test(name)) {
    const letter = name.charAt(0).toUpperCase();
    return {
      level: 'custom-suspected',
      confidence: 'INFERRED',
      reason: `name starts with ${letter} (X3 convention for specific developments, not a proof)`,
    };
  }
  return { level: 'standard', confidence: 'INFERRED', reason: 'no specific prefix (X/Y/Z)' };
}

/** Index BPCUSTOMER_BPC0 on table BPCUSTOMER -> code BPC0. */
export function indexCodeFromName(table: string, indexName: string): string | undefined {
  const prefix = `${table.toUpperCase()}_`;
  const upper = indexName.toUpperCase();
  if (!upper.startsWith(prefix) || upper.length === prefix.length) return undefined;
  return indexName.slice(prefix.length);
}

/** Index code BPC0 -> abbreviation BPC (trailing digits removed). */
export function abbreviationFromIndexCode(code: string): string | undefined {
  const m = /^([A-Za-z][A-Za-z0-9]*?)\d+$/.exec(code);
  return m ? m[1] : undefined;
}

export interface IndexLike {
  name: string;
  unique: boolean;
  primary: boolean;
  columns: string[];
}

export interface KeyInference {
  columns: string[];
  indexName: string;
  abbreviation?: Attr<string>;
  prov: Attr<string[]>['prov'];
}

/**
 * Primary key by X3 convention: unique index <TABLE>_<ABR>0. Falls back to a SQL primary key
 * constraint that is not only ROWID. Returns undefined when nothing reliable is found.
 */
export function inferPrimaryKey(table: string, indexes: IndexLike[]): KeyInference | undefined {
  const candidates = indexes
    .filter((i) => i.unique)
    .map((i) => ({ i, code: indexCodeFromName(table, i.name) }))
    // code <ABR>0: ends with a single 0 preceded by a letter (BPC0, not BPC10)
    .filter((x): x is { i: IndexLike; code: string } => x.code !== undefined && /[A-Za-z]0$/.test(x.code))
    .sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
  const best = candidates[0];
  if (best) {
    const abbr = abbreviationFromIndexCode(best.code);
    const res: KeyInference = {
      columns: best.i.columns,
      indexName: best.i.name,
      prov: { source: 'x3-convention', confidence: 'INFERRED', detail: `unique index ${best.i.name} (X3 convention <TABLE>_<ABR>0)` },
    };
    if (abbr) res.abbreviation = attr(abbr, 'x3-convention', 'INFERRED', `derived from index ${best.i.name}`);
    return res;
  }
  const pk = indexes.find((i) => i.primary && !(i.columns.length === 1 && /^ROWID$/i.test(i.columns[0] ?? '')));
  if (pk) {
    return {
      columns: pk.columns,
      indexName: pk.name,
      prov: { source: 'sql-catalog', confidence: 'EXACT', detail: `primary key constraint ${pk.name}` },
    };
  }
  return undefined;
}

/** "GESBPC" -> "BPC". Classic X3 object management functions are named GES + object code. */
export function objectFromFunction(functionCode: string): string | undefined {
  const m = /^GES([A-Z0-9_]{2,})$/i.exec(functionCode);
  return m ? (m[1] as string).toUpperCase() : undefined;
}
