/** Upper case without accents, for search ("Électricité" -> "ELECTRICITE"). */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();
}

/** A dictionary value usable as a label: non-empty and not a bare number (which would be a text reference). */
export function asText(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || /^\d+$/.test(s)) return undefined;
  return s;
}

export function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return undefined;
}

export function asCode(v: unknown): string | undefined {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s || undefined;
}
