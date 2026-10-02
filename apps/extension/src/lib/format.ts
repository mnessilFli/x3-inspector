/** Heuristic hint shown in the panel: a displayed value that probably differs from the raw DB value. */
export function looksFormatted(value: string): boolean {
  return /\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(value) || /\d[\s\u00a0\u202f]\d{3}/.test(value) || /\d,\d/.test(value);
}
