import type { CellValue } from '@x3i/shared';

/** Converts a driver value into a JSON-safe cell. */
export function toCell(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (Buffer.isBuffer(v)) return `<binary ${v.length} bytes>`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function toRow(raw: Record<string, unknown>, columns: string[]): Record<string, CellValue> {
  const row: Record<string, CellValue> = {};
  for (const c of columns) row[c] = toCell(raw[c]);
  return row;
}

/** Strict identifier check before inserting a name as a delimited identifier. */
export function assertIdentifier(name: string): string {
  if (!/^[A-Za-z0-9_]{1,128}$/.test(name)) throw new Error(`invalid SQL identifier: ${JSON.stringify(name)}`);
  return name;
}
