import type { SqlIssue, SqlValidation } from '@x3i/shared';
import { significant, tokenize, type SqlDialect, type Token } from './tokenizer';

/**
 * Keywords rejected anywhere outside strings, comments and delimited identifiers.
 * INTO is rejected because SELECT ... INTO creates a table (SQL Server).
 * This is the second line of defense: the SQL account itself must be read-only.
 */
export const FORBIDDEN_KEYWORDS: ReadonlySet<string> = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UPSERT', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'RENAME',
  'EXEC', 'EXECUTE', 'CALL', 'GRANT', 'REVOKE', 'DENY', 'INTO',
  'BACKUP', 'RESTORE', 'BULK', 'OPENROWSET', 'OPENQUERY', 'OPENDATASOURCE', 'OPENXML',
  'SHUTDOWN', 'DBCC', 'KILL', 'CHECKPOINT', 'RECONFIGURE', 'SETUSER', 'REVERT',
  'BEGIN', 'DECLARE', 'SET', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'LOCK', 'WAITFOR', 'USE',
  'UPDATETEXT', 'WRITETEXT', 'COMMENT', 'ANALYZE', 'PURGE', 'FLASHBACK', 'AUDIT', 'NOAUDIT',
  'NEXTVAL', // Oracle sequence increment is a side effect
  // locking table hints (SQL Server)
  'UPDLOCK', 'XLOCK', 'TABLOCK', 'TABLOCKX', 'HOLDLOCK', 'PAGLOCK',
]);

/** Identifier prefixes of system procedures / packages with side effects. */
const FORBIDDEN_PREFIXES = ['XP_', 'SP_', 'DBMS_', 'UTL_'];

export type ValidationDialect = SqlDialect | 'any';

export interface ReadOnlyOptions {
  /** 'any' validates under every dialect and requires all to pass (used when the DB type is unknown). */
  dialect: ValidationDialect;
}

export function validateReadOnly(sql: string, options: ReadOnlyOptions): SqlValidation {
  if (options.dialect === 'any') {
    const a = validateForDialect(sql, 'mssql');
    const b = validateForDialect(sql, 'oracle');
    return mergeValidations(a, b);
  }
  return validateForDialect(sql, options.dialect);
}

function validateForDialect(sql: string, dialect: SqlDialect): SqlValidation {
  const errors: SqlIssue[] = [];
  const warnings: SqlIssue[] = [];
  const lexed = tokenize(sql, dialect);
  if (lexed.errors.length) {
    return { ok: false, errors: lexed.errors, warnings };
  }

  let toks = significant(lexed.tokens);
  // tolerate trailing semicolons only
  while (toks.length && toks[toks.length - 1]?.text === ';') toks = toks.slice(0, -1);

  if (toks.length === 0) {
    return { ok: false, errors: [{ message: 'Empty query' }], warnings };
  }

  const innerSemicolon = toks.find((t) => t.text === ';');
  if (innerSemicolon) {
    errors.push({ message: 'Only one statement is allowed (";" found inside the query)', offset: innerSemicolon.start });
  }

  checkParentheses(toks, errors);

  const first = firstStatementWord(toks);
  if (!first || (first.upper !== 'SELECT' && first.upper !== 'WITH')) {
    errors.push({ message: 'Only SELECT queries (optionally starting with WITH) are allowed', offset: first?.start ?? 0 });
  } else if (first.upper === 'WITH') {
    checkWithMainStatement(toks, toks.indexOf(first), errors);
  }

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k] as Token;
    if (t.type !== 'word') continue;
    // No exemption after "." on purpose: T-SQL tolerates "a. DELETE", and X3 column names never equal
    // these keywords. A column really named like a keyword must be written as a delimited identifier.
    if (FORBIDDEN_KEYWORDS.has(t.upper)) {
      errors.push({ message: `Forbidden keyword in read-only mode: ${t.upper}`, offset: t.start });
    }
    if (FORBIDDEN_PREFIXES.some((p) => t.upper.startsWith(p))) {
      errors.push({ message: `System procedure or package not allowed: ${t.text}`, offset: t.start });
    }
    if (t.upper === 'FOR' && toks[k + 1]?.upper === 'UPDATE') {
      errors.push({ message: 'FOR UPDATE (row locking) is not allowed', offset: t.start });
    }
    if (t.upper === 'NEXT' && toks[k + 1]?.upper === 'VALUE' && toks[k + 2]?.upper === 'FOR') {
      errors.push({ message: 'NEXT VALUE FOR (sequence increment) is not allowed', offset: t.start });
    }
  }

  return { ok: errors.length === 0, errors: dedupe(errors), warnings };
}

/** Skips leading parentheses: "(SELECT ...) UNION (SELECT ...)" starts with SELECT. */
function firstStatementWord(toks: Token[]): Token | undefined {
  for (const t of toks) {
    if (t.text === '(') continue;
    return t.type === 'word' ? t : undefined;
  }
  return undefined;
}

function checkParentheses(toks: Token[], errors: SqlIssue[]): void {
  let depth = 0;
  for (const t of toks) {
    if (t.text === '(') depth++;
    else if (t.text === ')') {
      depth--;
      if (depth < 0) {
        errors.push({ message: 'Unbalanced parenthesis', offset: t.start });
        return;
      }
    }
  }
  if (depth !== 0) errors.push({ message: 'Unbalanced parenthesis' });
}

/**
 * WITH name [(cols)] AS ( ... ) [, name AS ( ... )]* <main statement>
 * The main statement must be a SELECT (rejects WITH ... DELETE / UPDATE / MERGE / INSERT).
 */
function checkWithMainStatement(toks: Token[], withIndex: number, errors: SqlIssue[]): void {
  let k = withIndex + 1;
  const after = toks[k];
  if (after && (after.upper === 'FUNCTION' || after.upper === 'PROCEDURE')) {
    errors.push({ message: 'PL/SQL declarations in WITH are not allowed', offset: after.start });
    return;
  }
  if (after?.upper === 'RECURSIVE') k++;
  for (;;) {
    // CTE name
    if (!toks[k] || (toks[k]?.type !== 'word' && toks[k]?.type !== 'quoted-ident')) {
      errors.push({ message: 'Malformed WITH clause', offset: toks[k]?.start });
      return;
    }
    k++;
    if (toks[k]?.text === '(') k = skipGroup(toks, k);
    if (toks[k]?.upper !== 'AS') {
      errors.push({ message: 'Malformed WITH clause (AS expected)', offset: toks[k]?.start });
      return;
    }
    k++;
    // Oracle / PostgreSQL style MATERIALIZED hints are not expected here; require "("
    if (toks[k]?.text !== '(') {
      errors.push({ message: 'Malformed WITH clause ("(" expected)', offset: toks[k]?.start });
      return;
    }
    k = skipGroup(toks, k);
    // Oracle SEARCH / CYCLE clauses are rare; they contain SET and are rejected by the keyword check.
    if (toks[k]?.text === ',') {
      k++;
      continue;
    }
    break;
  }
  let main = toks[k];
  while (main?.text === '(') main = toks[++k];
  if (!main || main.upper !== 'SELECT') {
    errors.push({ message: 'The statement after WITH must be a SELECT', offset: main?.start });
  }
}

/** Given the index of "(", returns the index after the matching ")". */
function skipGroup(toks: Token[], openIndex: number): number {
  let depth = 0;
  for (let k = openIndex; k < toks.length; k++) {
    const t = toks[k] as Token;
    if (t.text === '(') depth++;
    else if (t.text === ')') {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return toks.length;
}

function mergeValidations(a: SqlValidation, b: SqlValidation): SqlValidation {
  return { ok: a.ok && b.ok, errors: dedupe([...a.errors, ...b.errors]), warnings: dedupe([...a.warnings, ...b.warnings]) };
}

function dedupe(issues: SqlIssue[]): SqlIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.message}@${i.offset ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class ReadOnlyViolation extends Error {
  constructor(public readonly validation: SqlValidation) {
    super(validation.errors.map((e) => e.message).join('; ') || 'Query rejected');
    this.name = 'ReadOnlyViolation';
  }
}

export function assertReadOnly(sql: string, options: ReadOnlyOptions): void {
  const v = validateReadOnly(sql, options);
  if (!v.ok) throw new ReadOnlyViolation(v);
}
