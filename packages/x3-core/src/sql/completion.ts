import { resolveQualifier, scanTableRefs, scanTokens, type TableRef } from './tableRefs';
import { identifierText, isIdentifier, significant, tokenize, type SqlDialect, type Token } from './tokenizer';

export type CompletionKind = 'table' | 'column' | 'any' | 'none';

export interface CompletionContext {
  kind: CompletionKind;
  /** Partial word typed before the cursor. */
  prefix: string;
  /** Offset where the completion replaces text. */
  from: number;
  /** "BPC" in "BPC.BPC|" */
  qualifier?: string;
  /** Table the qualifier refers to, resolved through aliases of the whole statement. */
  qualifierTable?: string;
  /** Schema typed before the table name (FROM SEED.BP|). */
  schema?: string;
  tablesInScope: TableRef[];
}

/**
 * Decides what to suggest at the cursor:
 * - after FROM / JOIN / "," in a FROM list -> tables
 * - after "alias." -> columns of that alias' table
 * - otherwise -> columns of the tables in scope (and keywords, left to the editor)
 */
export function getCompletionContext(sql: string, cursor: number, dialect: SqlDialect): CompletionContext {
  const before = sql.slice(0, cursor);
  const lexed = tokenize(before, dialect);
  const tablesInScope = scanTableRefs(sql, dialect).refs.filter((r) => !r.isCte);
  const none: CompletionContext = { kind: 'none', prefix: '', from: cursor, tablesInScope };

  if (lexed.unterminated) return none;
  const last = lexed.tokens[lexed.tokens.length - 1];
  if (last && (last.type === 'comment' || last.type === 'string') && last.end === cursor) return none;
  if (last?.type === 'number' && last.end === cursor) return none;

  const sig = significant(lexed.tokens);
  let prefix = '';
  let from = cursor;
  let rest = sig;
  const lastSig = sig[sig.length - 1];
  if (lastSig && lastSig.end === cursor && (lastSig.type === 'word' || lastSig.type === 'quoted-ident')) {
    prefix = identifierText(lastSig);
    from = lastSig.start;
    rest = sig.slice(0, -1);
  }

  let qualifier: string | undefined;
  const dot = rest[rest.length - 1];
  const qualTok = rest[rest.length - 2];
  if (dot?.text === '.' && isIdentifier(qualTok)) {
    qualifier = identifierText(qualTok);
    rest = rest.slice(0, -2);
  }

  const scan = scanTokens(rest);
  if (scan.expectingTable) {
    const ctx: CompletionContext = { kind: 'table', prefix, from, tablesInScope };
    if (qualifier !== undefined) ctx.schema = qualifier;
    return ctx;
  }

  if (qualifier !== undefined) {
    const ref = resolveQualifier(tablesInScope, qualifier);
    const ctx: CompletionContext = { kind: 'column', prefix, from, qualifier, tablesInScope };
    if (ref) ctx.qualifierTable = ref.table;
    return ctx;
  }

  return { kind: 'any', prefix, from, tablesInScope };
}

export interface WordAt {
  word: string;
  from: number;
  to: number;
  qualifier?: string;
}

/** Identifier under a position (for hover tooltips). */
export function wordAt(sql: string, pos: number, dialect: SqlDialect): WordAt | null {
  const toks = significant(tokenize(sql, dialect).tokens);
  const idx = toks.findIndex((t) => t.start <= pos && pos <= t.end && isIdentifier(t));
  if (idx < 0) return null;
  const t = toks[idx] as Token;
  const res: WordAt = { word: identifierText(t), from: t.start, to: t.end };
  const dot = toks[idx - 1];
  const q = toks[idx - 2];
  if (dot?.text === '.' && isIdentifier(q)) res.qualifier = identifierText(q);
  return res;
}
