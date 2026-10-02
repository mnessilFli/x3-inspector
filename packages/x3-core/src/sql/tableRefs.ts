import { identifierText, isIdentifier, significant, tokenize, type SqlDialect, type Token } from './tokenizer';

export interface TableRef {
  /** Table name without delimiters. */
  table: string;
  schema?: string;
  alias?: string;
  /** Token of the table name, to rewrite it in place. */
  tableToken: Token;
  /** Token of the first qualifier part when the reference is qualified. */
  firstToken: Token;
  /** True when the name refers to a CTE declared in WITH. */
  isCte: boolean;
}

export interface TableRefScan {
  refs: TableRef[];
  cteNames: Set<string>;
  /** True when the last token leaves the parser expecting a table name (after FROM, JOIN, or "," in a FROM list). */
  expectingTable: boolean;
}

const CLAUSE_END = new Set([
  'WHERE', 'GROUP', 'ORDER', 'HAVING', 'UNION', 'INTERSECT', 'EXCEPT', 'MINUS', 'WINDOW', 'FETCH', 'OFFSET',
  'FOR', 'CONNECT', 'START', 'LIMIT', 'OPTION', 'MODEL', 'SELECT', 'ON', 'USING',
]);

const JOIN_WORDS = new Set(['JOIN', 'APPLY']);
const TABLE_PREFIX_WORDS = new Set(['LATERAL', 'ONLY']);

/** Words that cannot be an alias after a table name. */
const NOT_ALIAS = new Set([
  ...CLAUSE_END, 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'NATURAL', 'APPLY', 'AS', 'FROM',
  'WITH', 'PIVOT', 'UNPIVOT', 'TABLESAMPLE', 'PARTITION', 'AND', 'OR', 'NOT',
]);

/** Functions whose argument syntax contains FROM: EXTRACT(YEAR FROM d), TRIM(x FROM y)... */
const FUNCTIONS_WITH_FROM = new Set(['EXTRACT', 'TRIM', 'SUBSTRING', 'OVERLAY', 'POSITION']);

interface Frame {
  inFrom: boolean;
  fn: string | undefined;
}

export function scanTableRefs(sql: string, dialect: SqlDialect): TableRefScan {
  return scanTokens(significant(tokenize(sql, dialect).tokens));
}

export function scanTokens(toks: Token[]): TableRefScan {
  const cteNames = collectCteNames(toks);
  const refs: TableRef[] = [];
  const stack: Frame[] = [{ inFrom: false, fn: undefined }];
  let expect = false;

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k] as Token;
    const top = stack[stack.length - 1] as Frame;

    if (t.text === '(') {
      const prev = toks[k - 1];
      stack.push({ inFrom: false, fn: prev?.type === 'word' ? prev.upper : undefined });
      expect = false;
      continue;
    }
    if (t.text === ')') {
      if (stack.length > 1) stack.pop();
      expect = false;
      continue;
    }
    if (t.type === 'word' && !expect) {
      if (t.upper === 'FROM') {
        if (top.fn && FUNCTIONS_WITH_FROM.has(top.fn)) continue;
        top.inFrom = true;
        expect = true;
        continue;
      }
      if (JOIN_WORDS.has(t.upper)) {
        top.inFrom = true;
        expect = true;
        continue;
      }
      if (CLAUSE_END.has(t.upper) && t.upper !== 'ON' && t.upper !== 'USING') {
        top.inFrom = false;
      }
      continue;
    }
    if (expect && t.type === 'word' && TABLE_PREFIX_WORDS.has(t.upper)) continue;
    if (expect && isIdentifier(t)) {
      const parts: Token[] = [t];
      let j = k;
      while (toks[j + 1]?.text === '.' && isIdentifier(toks[j + 2])) {
        parts.push(toks[j + 2] as Token);
        j += 2;
      }
      expect = false;
      // table-valued function: name(...)
      if (toks[j + 1]?.text === '(') {
        k = j;
        continue;
      }
      const tableToken = parts[parts.length - 1] as Token;
      const table = identifierText(tableToken);
      const schemaToken = parts.length > 1 ? parts[parts.length - 2] : undefined;
      const ref: TableRef = {
        table,
        tableToken,
        firstToken: t,
        isCte: parts.length === 1 && cteNames.has(table.toUpperCase()),
      };
      if (schemaToken) ref.schema = identifierText(schemaToken);
      let a = j + 1;
      if (toks[a]?.upper === 'AS') a++;
      const aliasTok = toks[a];
      if (isIdentifier(aliasTok) && !(aliasTok.type === 'word' && NOT_ALIAS.has(aliasTok.upper))) {
        ref.alias = identifierText(aliasTok);
        j = a;
      }
      refs.push(ref);
      k = j;
      continue;
    }
    if (t.text === ',' && top.inFrom) {
      expect = true;
      continue;
    }
    expect = false;
  }

  return { refs, cteNames, expectingTable: expect };
}

/** WITH a AS (...), b (x, y) AS (...) SELECT ... -> {A, B} */
function collectCteNames(toks: Token[]): Set<string> {
  const names = new Set<string>();
  let k = 0;
  while (toks[k]?.text === '(') k++;
  if (toks[k]?.upper !== 'WITH') return names;
  k++;
  if (toks[k]?.upper === 'RECURSIVE') k++;
  for (;;) {
    const nameTok = toks[k];
    if (!isIdentifier(nameTok)) return names;
    names.add(identifierText(nameTok).toUpperCase());
    k++;
    if (toks[k]?.text === '(') k = skipGroup(toks, k);
    if (toks[k]?.upper !== 'AS') return names;
    k++;
    if (toks[k]?.text !== '(') return names;
    k = skipGroup(toks, k);
    if (toks[k]?.text !== ',') return names;
    k++;
  }
}

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

/** Resolves an alias or table name used as qualifier ("BPC" in BPC.BPCNUM_0) to a table reference. */
export function resolveQualifier(refs: TableRef[], qualifier: string): TableRef | undefined {
  const q = qualifier.toUpperCase();
  return refs.find((r) => r.alias?.toUpperCase() === q) ?? refs.find((r) => r.table.toUpperCase() === q);
}
