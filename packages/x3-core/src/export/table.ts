import type { CellValue } from '@x3i/shared';

export interface CsvOptions {
  /** "," by default; ";" opens directly in a French Excel. */
  separator?: string;
  /** Prefix with a UTF-8 BOM so Excel detects the encoding. */
  bom?: boolean;
}

function cell(v: CellValue | undefined, sep: string): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Array<Record<string, CellValue>>, options: CsvOptions = {}): string {
  const sep = options.separator ?? ',';
  const lines = [columns.map((c) => cell(c, sep)).join(sep)];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c], sep)).join(sep));
  return `${options.bom ? '﻿' : ''}${lines.join('\r\n')}\r\n`;
}

export function toJson(rows: unknown, pretty = true): string {
  return JSON.stringify(rows, null, pretty ? 2 : 0);
}
