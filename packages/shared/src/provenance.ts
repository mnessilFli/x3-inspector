/**
 * Every piece of information X3 Inspector shows carries where it comes from and how sure we are.
 * Rule of the project: a missing value is better than a wrong one.
 */
export type Confidence = 'EXACT' | 'METADATA' | 'INFERRED' | 'UNKNOWN';

export type SourceKind =
  | 'sql-catalog' // INFORMATION_SCHEMA / sys.* / ALL_* : physical structure, verifiable
  | 'x3-dictionary' // X3 dictionary tables read through a probed mapping
  | 'x3-context-files' // offline files produced by the x3-connect skill
  | 'x3-convention' // X3 naming convention applied to catalog data (FIELD_0, <TABLE>_<ABR>0...)
  | 'dom' // read from the X3 page DOM
  | 'url' // parsed from the X3 page URL or title
  | 'syracuse' // observed in the Syracuse client/server messages (screen description, field focus)
  | 'config' // user configuration (environment, folder)
  | 'manual' // typed or corrected by the user
  | 'inference' // other rule-based deduction
  | 'knowledge-base'; // relations validated by the user (V2)

export interface Provenance {
  source: SourceKind;
  confidence: Confidence;
  /** Human readable detail, e.g. "index BPCUSTOMER_BPC0" or "URL rule syracuse-function". */
  detail?: string;
}

/** A value with its provenance. Absence of the attribute means UNKNOWN. */
export interface Attr<T> {
  value: T;
  prov: Provenance;
}

/** A value that may be unknown, with the reason when it is. */
export interface Sourced<T> {
  value: T | null;
  prov: Provenance;
}

export function attr<T>(value: T, source: SourceKind, confidence: Confidence, detail?: string): Attr<T> {
  return { value, prov: makeProv(source, confidence, detail) };
}

export function known<T>(value: T, source: SourceKind, confidence: Confidence, detail?: string): Sourced<T> {
  return { value, prov: makeProv(source, confidence, detail) };
}

export function unknown<T>(reason: string): Sourced<T> {
  return { value: null, prov: { source: 'inference', confidence: 'UNKNOWN', detail: reason } };
}

export function fromAttr<T>(a: Attr<T> | undefined, reasonIfMissing: string): Sourced<T> {
  return a ? { value: a.value, prov: a.prov } : unknown<T>(reasonIfMissing);
}

function makeProv(source: SourceKind, confidence: Confidence, detail?: string): Provenance {
  return detail === undefined ? { source, confidence } : { source, confidence, detail };
}

const RANK: Record<Confidence, number> = { EXACT: 3, METADATA: 2, INFERRED: 1, UNKNOWN: 0 };

export function confidenceRank(c: Confidence): number {
  return RANK[c];
}

/** Returns the most reliable known candidate (first wins on ties), or the first one when all are unknown. */
export function bestOf<T>(...candidates: Array<Sourced<T> | undefined>): Sourced<T> {
  const list = candidates.filter((c): c is Sourced<T> => c !== undefined);
  const knownOnes = list.filter((c) => c.value !== null);
  if (knownOnes.length === 0) return list[0] ?? unknown<T>('no source');
  return knownOnes.reduce((a, b) => (RANK[b.prov.confidence] > RANK[a.prov.confidence] ? b : a));
}
