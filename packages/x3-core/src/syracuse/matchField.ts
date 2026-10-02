import type { SyracuseFieldDef, SyracuseWindowDictionary } from './protocol';

export interface DomFieldClues {
  label: string | null;
  /** Syracuse UI type from the DOM class s-field-type-<type>, e.g. x-string. */
  uiType: string | null;
  maxLength: number | null;
}

/**
 * Fallback when no focus message identifies the field: candidates of the window whose label,
 * type and length agree with the DOM. Unique match = INFERRED, several = ambiguous.
 */
export function matchFieldByClues(dict: SyracuseWindowDictionary, clues: DomFieldClues): SyracuseFieldDef[] {
  const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const label = norm(clues.label);
  if (!label) return [];
  return Object.values(dict.fields).filter((f) => {
    if (norm(f.label) !== label) return false;
    if (clues.uiType && f.type && f.type !== `application/${clues.uiType}`) return false;
    if (clues.maxLength !== null && f.maxLength !== null && f.maxLength !== clues.maxLength) return false;
    return true;
  });
}
