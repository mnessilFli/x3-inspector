import { known, unknown, type FieldInspection, type Sourced, type X3Field, type X3Table } from '@x3i/shared';
import { parseColumnName } from '../metadata/conventions';

export interface ResolvedField {
  /** Technical field name with provenance. */
  name: Sourced<string>;
  field: X3Field | null;
  checked: Array<{ name: string; origin: string; found: boolean }>;
}

/**
 * Confirms DOM candidates against the fields of the main table. A candidate becomes METADATA only
 * when the field exists in the table; otherwise the best candidate is shown as INFERRED.
 */
export function resolveInspectedField(inspection: FieldInspection, table: X3Table | null): ResolvedField {
  const checked: ResolvedField['checked'] = [];
  if (table) {
    const byName = new Map(table.fields.map((f) => [f.name.toUpperCase(), f]));
    for (const c of inspection.candidates) {
      const f = byName.get(c.name.toUpperCase()) ?? byName.get(parseColumnName(c.name).field.toUpperCase());
      checked.push({ name: c.name, origin: c.origin, found: f !== undefined });
      if (f) {
        return {
          name: known(f.name, 'dom', 'METADATA', `candidate from ${c.origin}, confirmed in ${table.name}`),
          field: f,
          checked,
        };
      }
    }
  }
  const best = inspection.candidates[0];
  if (best) {
    return {
      name: known(best.name, 'dom', 'INFERRED', table ? `from ${best.origin}; not found in ${table.name}` : `from ${best.origin}; main table unknown, not confirmed`),
      field: null,
      checked,
    };
  }
  return { name: unknown('no technical name candidate in the element attributes'), field: null, checked };
}
