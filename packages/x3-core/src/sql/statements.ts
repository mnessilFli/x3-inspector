import { tokenize, type SqlDialect } from './tokenizer';

/**
 * Removes trailing semicolons (and what follows them: whitespace, comments). Oracle rejects a
 * statement ending with ";" (ORA-00933 / ORA-00911) when sent through a driver.
 * Comments placed after the last semicolon are dropped as well.
 */
export function stripTrailingSemicolons(sql: string, dialect: SqlDialect): string {
  const tokens = tokenize(sql, dialect).tokens;
  let end = tokens.length;
  for (let k = tokens.length - 1; k >= 0; k--) {
    const t = tokens[k];
    if (!t) break;
    if (t.type === 'whitespace' || t.type === 'comment') continue;
    if (t.text === ';') {
      end = k;
      continue;
    }
    break;
  }
  if (end === tokens.length) return sql;
  const cut = tokens[end];
  return cut ? sql.slice(0, cut.start).trimEnd() : sql;
}
