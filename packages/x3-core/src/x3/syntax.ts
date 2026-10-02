/**
 * L4G notations shown for copy. [F:ABR] is the table buffer class, [M:SCREEN] the screen class.
 * Note: some teams read values with [ABR]FIELD and keep [F:ABR] for clalev(); both are offered.
 */
export function tableFieldSyntax(abbreviation: string, field: string, dimIndex?: number | null): string {
  return `[F:${abbreviation}]${field}${dimIndex !== undefined && dimIndex !== null ? `(${dimIndex})` : ''}`;
}

export function classFieldSyntax(abbreviation: string, field: string): string {
  return `[${abbreviation}]${field}`;
}

export function screenFieldSyntax(screenAbbreviation: string, field: string): string {
  return `[M:${screenAbbreviation}]${field}`;
}
