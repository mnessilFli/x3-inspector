import type { SqlIssue } from '@x3i/shared';

export type SqlDialect = 'mssql' | 'oracle';

export type TokenType =
  | 'word'
  | 'quoted-ident' // "..." or [...]
  | 'string' // '...', N'...', q'[...]' (Oracle)
  | 'number'
  | 'param' // @p, :p, ?
  | 'comment'
  | 'whitespace'
  | 'punct' // ( ) , ; .
  | 'operator';

export interface Token {
  type: TokenType;
  text: string;
  start: number;
  end: number;
  /** Upper-cased text for words, to compare keywords. */
  upper: string;
}

export interface TokenizeResult {
  tokens: Token[];
  errors: SqlIssue[];
  /** True when the text ends inside a string, comment or delimited identifier. */
  unterminated: boolean;
}

const WORD_START = /[\p{L}_#]/u;
const WORD_PART = /[\p{L}\p{N}_$#]/u;
const DIGIT = /[0-9]/;
const SPACE = /\s/;
const PUNCT = new Set(['(', ')', ',', ';', '.']);
const Q_CLOSERS: Record<string, string> = { '[': ']', '(': ')', '{': '}', '<': '>' };

/**
 * Lexes SQL text. Dialect matters for security:
 * - nested block comments exist in SQL Server only;
 * - q'[...]' alternative quoting exists in Oracle only.
 * Lexing with the wrong dialect could hide a statement, see readOnly.ts.
 */
export function tokenize(sql: string, dialect: SqlDialect): TokenizeResult {
  const tokens: Token[] = [];
  const errors: SqlIssue[] = [];
  let unterminated = false;
  let i = 0;
  const n = sql.length;

  const push = (type: TokenType, start: number, end: number) => {
    const text = sql.slice(start, end);
    tokens.push({ type, text, start, end, upper: type === 'word' ? text.toUpperCase() : text });
  };

  while (i < n) {
    const c = sql[i] as string;
    const next = sql[i + 1];
    const start = i;

    if (SPACE.test(c)) {
      while (i < n && SPACE.test(sql[i] as string)) i++;
      push('whitespace', start, i);
      continue;
    }

    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      push('comment', start, i);
      continue;
    }

    if (c === '/' && next === '*') {
      i += 2;
      let depth = 1;
      while (i < n && depth > 0) {
        if (dialect === 'mssql' && sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      if (depth > 0) {
        unterminated = true;
        errors.push({ message: 'Unterminated block comment', offset: start });
      }
      push('comment', start, i);
      continue;
    }

    // Oracle alternative quoting: q'[...]', Q'{...}', nq'<...>'
    if (dialect === 'oracle' && isOracleQQuote(sql, i)) {
      const quoteAt = sql.indexOf("'", i);
      const open = sql[quoteAt + 1];
      if (open === undefined) {
        unterminated = true;
        errors.push({ message: 'Unterminated string literal', offset: start });
        push('string', start, n);
        i = n;
        continue;
      }
      const close = Q_CLOSERS[open] ?? open;
      let j = quoteAt + 2;
      while (j < n && !(sql[j] === close && sql[j + 1] === "'")) j++;
      if (j >= n) {
        unterminated = true;
        errors.push({ message: 'Unterminated string literal', offset: start });
        i = n;
      } else {
        i = j + 2;
      }
      push('string', start, i);
      continue;
    }

    // N'...' national string
    if ((c === 'N' || c === 'n') && next === "'") {
      i = readQuoted(sql, i + 1, "'");
      if (i < 0) {
        unterminated = true;
        errors.push({ message: 'Unterminated string literal', offset: start });
        i = n;
      }
      push('string', start, i);
      continue;
    }

    if (c === "'") {
      i = readQuoted(sql, i, "'");
      if (i < 0) {
        unterminated = true;
        errors.push({ message: 'Unterminated string literal', offset: start });
        i = n;
      }
      push('string', start, i);
      continue;
    }

    if (c === '"') {
      i = readQuoted(sql, i, '"');
      if (i < 0) {
        unterminated = true;
        errors.push({ message: 'Unterminated quoted identifier', offset: start });
        i = n;
      }
      push('quoted-ident', start, i);
      continue;
    }

    if (c === '[') {
      i = readQuoted(sql, i, ']');
      if (i < 0) {
        unterminated = true;
        errors.push({ message: 'Unterminated bracketed identifier', offset: start });
        i = n;
      }
      push('quoted-ident', start, i);
      continue;
    }

    if (DIGIT.test(c) || (c === '.' && next !== undefined && DIGIT.test(next))) {
      if (c === '0' && (next === 'x' || next === 'X')) {
        i += 2;
        while (i < n && /[0-9a-fA-F]/.test(sql[i] as string)) i++;
      } else {
        while (i < n && DIGIT.test(sql[i] as string)) i++;
        if (sql[i] === '.') {
          i++;
          while (i < n && DIGIT.test(sql[i] as string)) i++;
        }
        if ((sql[i] === 'e' || sql[i] === 'E') && /[0-9+-]/.test(sql[i + 1] ?? '')) {
          i += 2;
          while (i < n && DIGIT.test(sql[i] as string)) i++;
        }
      }
      push('number', start, i);
      continue;
    }

    if (c === '@' || (c === ':' && next !== undefined && WORD_START.test(next))) {
      i++;
      if (sql[i] === '@') i++; // @@ROWCOUNT style
      while (i < n && WORD_PART.test(sql[i] as string)) i++;
      push('param', start, i);
      continue;
    }

    if (c === '?') {
      i++;
      push('param', start, i);
      continue;
    }

    if (WORD_START.test(c)) {
      i++;
      while (i < n && WORD_PART.test(sql[i] as string)) i++;
      push('word', start, i);
      continue;
    }

    if (PUNCT.has(c)) {
      i++;
      push('punct', start, i);
      continue;
    }

    i++;
    while (i < n && /[<>=!|&^~%*+\-/]/.test(sql[i] as string) && /[<>=!|&^~%*+\-/]/.test(c)) {
      // keep multi-char operators together (<=, <>, !=, ||) but never swallow a comment start
      if ((sql[i] === '-' && sql[i + 1] === '-') || (sql[i] === '/' && sql[i + 1] === '*')) break;
      i++;
    }
    push('operator', start, i);
  }

  return { tokens, errors, unterminated };
}

/** Returns the index after the closing quote, or -1 when unterminated. Doubled quote escapes. */
function readQuoted(sql: string, openAt: number, close: string): number {
  let i = openAt + 1;
  while (i < sql.length) {
    if (sql[i] === close) {
      if (sql[i + 1] === close) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return -1;
}

function isOracleQQuote(sql: string, i: number): boolean {
  const c = sql[i];
  if (c === 'q' || c === 'Q') return sql[i + 1] === "'" && !isWordCharBefore(sql, i);
  if ((c === 'n' || c === 'N') && (sql[i + 1] === 'q' || sql[i + 1] === 'Q')) return sql[i + 2] === "'" && !isWordCharBefore(sql, i);
  return false;
}

function isWordCharBefore(sql: string, i: number): boolean {
  const prev = sql[i - 1];
  return prev !== undefined && WORD_PART.test(prev);
}

/** Tokens that carry meaning (no whitespace, no comments). */
export function significant(tokens: Token[]): Token[] {
  return tokens.filter((t) => t.type !== 'whitespace' && t.type !== 'comment');
}

/** Identifier text without delimiters: [A B] -> A B, "x" -> x. */
export function identifierText(t: Token): string {
  if (t.type === 'quoted-ident') {
    const inner = t.text.slice(1, -1);
    return t.text.startsWith('[') ? inner.replace(/]]/g, ']') : inner.replace(/""/g, '"');
  }
  return t.text;
}

export function isIdentifier(t: Token | undefined): t is Token {
  return t !== undefined && (t.type === 'word' || t.type === 'quoted-ident');
}
