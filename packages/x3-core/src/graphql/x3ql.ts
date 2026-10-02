import type { CellValue } from '@x3i/shared';
import { significant, tokenize, type Token } from '../sql/tokenizer';
import type { GqlNode, GqlProp, GqlSchemaIndex } from './schemaIndex';

/**
 * X3QL: a SOQL-like syntax for Salesforce developers, translated to X3 GraphQL.
 *
 *   SELECT code, companyName1, customerCategory.code FROM customer
 *   WHERE isActive = true AND companyName1 LIKE 'KAO%' ORDER BY code DESC LIMIT 50
 *
 * Only what the Sage GraphQL documentation shows is generated (synthese-graphql-x3.md, FT p.3-12):
 * query(first, filter, orderBy), filter operators _gte, _lte, _regex, nested objects, orderBy 1 / -1.
 * Anything else is refused with an explicit message rather than guessed.
 */

export interface X3qlColumn {
  /** Column name in results, e.g. "customerCategory.code". */
  name: string;
  path: string[];
  /** Leaf selection added under the last segment (references: _id, texts: value). */
  leaf: '_id' | 'value' | null;
}

export interface X3qlQuery {
  node: GqlNode;
  columns: X3qlColumn[];
  filter: string | null;
  orderBy: string | null;
  limit: number;
  graphql: string;
}

export interface X3qlIssue {
  message: string;
  offset?: number;
}

export type X3qlResult = { ok: true; query: X3qlQuery } | { ok: false; errors: X3qlIssue[] };

export const X3QL_DEFAULT_LIMIT = 100;
export const X3QL_MAX_LIMIT = 1000;

const READABLE = new Set(['scalar', 'enum', 'reference', 'text']);

export function findNode(index: GqlSchemaIndex, name: string): GqlNode[] {
  const n = name.toLowerCase();
  if (n.includes('.')) {
    const [pkg, node] = n.split('.', 2);
    return index.nodes.filter((x) => x.pkg.toLowerCase() === pkg && x.node.toLowerCase() === node);
  }
  const exact = index.nodes.filter((x) => x.node.toLowerCase() === n);
  return exact.length ? exact : index.nodes.filter((x) => x.typeName.toLowerCase() === n);
}

/** Readable node whose GraphQL type is the target of a reference property. */
export function targetNode(index: GqlSchemaIndex, prop: GqlProp): GqlNode | undefined {
  return prop.kind === 'reference' ? index.nodes.find((n) => n.typeName === prop.typeName) : undefined;
}

function prop(node: GqlNode, name: string): GqlProp | undefined {
  const n = name.toLowerCase();
  return node.props.find((p) => p.name.toLowerCase() === n);
}

class Parser {
  private k = 0;
  readonly errors: X3qlIssue[] = [];
  constructor(private readonly toks: Token[]) {}
  peek(o = 0): Token | undefined {
    return this.toks[this.k + o];
  }
  next(): Token | undefined {
    return this.toks[this.k++];
  }
  isWord(w: string, o = 0): boolean {
    return this.peek(o)?.upper === w;
  }
  done(): boolean {
    return this.k >= this.toks.length;
  }
  fail(message: string, t?: Token): null {
    this.errors.push(t ? { message, offset: t.start } : { message });
    return null;
  }
  /** a.b.c */
  path(): { path: string[]; start: Token } | null {
    const start = this.next();
    if (!start || (start.type !== 'word' && start.type !== 'quoted-ident')) return this.fail('Field name expected', start);
    const path = [start.text];
    while (this.peek()?.text === '.' && this.peek(1)?.type === 'word') {
      this.k++;
      path.push((this.next() as Token).text);
    }
    return { path, start };
  }
}

interface Condition {
  path: string[];
  op: 'eq' | 'gte' | 'lte' | 'regex';
  value: string | number | boolean;
}

export function parseX3ql(text: string, index: GqlSchemaIndex): X3qlResult {
  const lexed = tokenize(text, 'mssql');
  if (lexed.errors.length) return { ok: false, errors: lexed.errors };
  let toks = significant(lexed.tokens);
  while (toks[toks.length - 1]?.text === ';') toks = toks.slice(0, -1);
  const p = new Parser(toks);

  if (!p.isWord('SELECT')) return { ok: false, errors: [{ message: 'The query must start with SELECT', offset: 0 }] };
  p.next();

  const selected: Array<{ path: string[] | '*'; start: Token }> = [];
  for (;;) {
    const t = p.peek();
    if (t?.text === '*') {
      p.next();
      selected.push({ path: '*', start: t });
    } else {
      const r = p.path();
      if (!r) return { ok: false, errors: p.errors };
      selected.push(r);
    }
    if (p.peek()?.text === ',') {
      p.next();
      continue;
    }
    break;
  }

  if (!p.isWord('FROM')) return { ok: false, errors: [{ message: 'FROM expected after the field list', offset: p.peek()?.start }] };
  p.next();
  const from = p.path();
  if (!from) return { ok: false, errors: p.errors };
  const nodes = findNode(index, from.path.join('.'));
  if (nodes.length === 0) return { ok: false, errors: [{ message: `Unknown GraphQL object "${from.path.join('.')}"`, offset: from.start.start }] };
  if (nodes.length > 1) {
    return { ok: false, errors: [{ message: `"${from.path.join('.')}" exists in several packages: write ${nodes.map((n) => `${n.pkg}.${n.node}`).join(' or ')}`, offset: from.start.start }] };
  }
  const node = nodes[0] as GqlNode;

  const conditions: Array<Condition & { start: Token }> = [];
  if (p.isWord('WHERE')) {
    p.next();
    for (;;) {
      const r = p.path();
      if (!r) return { ok: false, errors: p.errors };
      const opTok = p.next();
      let op: Condition['op'];
      if (opTok?.text === '=') op = 'eq';
      else if (opTok?.text === '>=') op = 'gte';
      else if (opTok?.text === '<=') op = 'lte';
      else if (opTok?.upper === 'LIKE') op = 'regex';
      else {
        return {
          ok: false,
          errors: [{ message: `Operator "${opTok?.text ?? ''}" not supported: use =, >=, <= or LIKE (operators documented by Sage: _gte, _lte, _regex)`, offset: opTok?.start }],
        };
      }
      const vt = p.next();
      let value: string | number | boolean;
      if (vt?.type === 'string') value = vt.text.replace(/^N?'/, '').slice(0, -1).replace(/''/g, "'");
      else if (vt?.type === 'number') value = Number(vt.text);
      else if (vt?.upper === 'TRUE' || vt?.upper === 'FALSE') value = vt.upper === 'TRUE';
      else return { ok: false, errors: [{ message: "Value expected: 'text', number, true or false", offset: vt?.start }] };
      if (op === 'regex' && typeof value !== 'string') return { ok: false, errors: [{ message: 'LIKE needs a text pattern', offset: vt.start }] };
      conditions.push({ path: r.path, op, value, start: r.start });
      if (p.isWord('AND')) {
        p.next();
        continue;
      }
      if (p.isWord('OR')) return { ok: false, errors: [{ message: 'OR is not supported (not documented for X3 GraphQL filters)', offset: p.peek()?.start }] };
      break;
    }
  }

  const order: Array<{ path: string[]; dir: 1 | -1; start: Token }> = [];
  if (p.isWord('ORDER') && p.isWord('BY', 1)) {
    p.next();
    p.next();
    for (;;) {
      const r = p.path();
      if (!r) return { ok: false, errors: p.errors };
      let dir: 1 | -1 = 1;
      if (p.isWord('ASC')) p.next();
      else if (p.isWord('DESC')) {
        p.next();
        dir = -1;
      }
      order.push({ path: r.path, dir, start: r.start });
      if (p.peek()?.text === ',') {
        p.next();
        continue;
      }
      break;
    }
  }

  let limit = X3QL_DEFAULT_LIMIT;
  if (p.isWord('LIMIT')) {
    p.next();
    const n = p.next();
    if (n?.type !== 'number' || !Number.isInteger(Number(n.text)) || Number(n.text) < 1) return { ok: false, errors: [{ message: 'LIMIT needs a positive integer', offset: n?.start }] };
    limit = Math.min(Number(n.text), X3QL_MAX_LIMIT);
  }
  if (!p.done()) return { ok: false, errors: [{ message: `Unexpected "${p.peek()?.text}"`, offset: p.peek()?.start }] };

  // ---- validation against the schema
  const errors: X3qlIssue[] = [];
  const resolvePath = (path: string[], start: Token, forFilter: boolean): { props: GqlProp[] } | null => {
    const props: GqlProp[] = [];
    let cur: GqlNode | undefined = node;
    for (let i = 0; i < path.length; i++) {
      const seg = path[i] as string;
      if (!cur) {
        errors.push({ message: `${path.slice(0, i).join('.')} is not a readable object: cannot go to ${seg}`, offset: start.start });
        return null;
      }
      const pr = seg === '_id' ? { name: '_id', x3Field: null, label: 'Id', kind: 'scalar' as const, typeName: 'Id' } : prop(cur, seg);
      if (!pr) {
        errors.push({ message: `${cur.node} has no property "${seg}"`, offset: start.start });
        return null;
      }
      if (!READABLE.has(pr.kind)) {
        errors.push({ message: `${seg} is a ${pr.kind}: sub-collections cannot be selected yet`, offset: start.start });
        return null;
      }
      props.push(pr);
      if (i < path.length - 1) cur = targetNode(index, pr);
    }
    if (path.length > 3) {
      errors.push({ message: 'At most 2 levels of references (a.b.c)', offset: start.start });
      return null;
    }
    const last = props[props.length - 1] as GqlProp;
    if (forFilter && last.kind === 'reference') {
      errors.push({ message: `${path.join('.')} is a reference: filter on one of its properties, e.g. ${path.join('.')}._id`, offset: start.start });
      return null;
    }
    return { props };
  };

  const columns: X3qlColumn[] = [];
  const addColumn = (path: string[], last: GqlProp) => {
    const name = path.join('.');
    if (columns.some((c) => c.name === name)) return;
    columns.push({ name, path, leaf: last.kind === 'reference' ? '_id' : last.kind === 'text' ? 'value' : null });
  };
  for (const s of selected) {
    if (s.path === '*') {
      for (const pr of node.props) if (READABLE.has(pr.kind)) addColumn([pr.name], pr);
      continue;
    }
    const r = resolvePath(s.path, s.start, false);
    if (r) addColumn(s.path.map((seg, i) => (r.props[i] as GqlProp).name ?? seg), r.props[r.props.length - 1] as GqlProp);
  }

  const filterObj: Record<string, unknown> = {};
  for (const c of conditions) {
    const r = resolvePath(c.path, c.start, true);
    if (!r) continue;
    const names = r.props.map((x) => x.name);
    let target = filterObj;
    for (const n of names.slice(0, -1)) target = (target[n] ??= {}) as Record<string, unknown>;
    const leafName = names[names.length - 1] as string;
    const value = c.op === 'regex' ? likeToRegex(c.value as string) : c.value;
    if (c.op === 'eq') {
      if (target[leafName] !== undefined) errors.push({ message: `${c.path.join('.')} has several conditions with =`, offset: c.start.start });
      target[leafName] = value;
    } else {
      const existing = target[leafName];
      if (existing !== undefined && (typeof existing !== 'object' || existing === null)) {
        errors.push({ message: `${c.path.join('.')} cannot combine = with another operator`, offset: c.start.start });
        continue;
      }
      target[leafName] = { ...((existing as Record<string, unknown>) ?? {}), [`_${c.op}`]: value };
    }
  }

  const orderObj: Record<string, number> = {};
  for (const o of order) {
    if (o.path.length > 1) {
      errors.push({ message: 'ORDER BY on a reference property is not supported: sort on a field of the object', offset: o.start.start });
      continue;
    }
    const r = resolvePath(o.path, o.start, true);
    if (r) orderObj[(r.props[0] as GqlProp).name] = o.dir;
  }

  if (errors.length) return { ok: false, errors };
  if (columns.length === 0) return { ok: false, errors: [{ message: 'No field to select' }] };

  const filter = Object.keys(filterObj).length ? x3Literal(filterObj) : null;
  const orderBy = Object.keys(orderObj).length ? x3Literal(orderObj) : null;
  const args = [`first: ${limit}`];
  if (filter) args.push(`filter: ${JSON.stringify(filter)}`);
  if (orderBy) args.push(`orderBy: ${JSON.stringify(orderBy)}`);
  const graphql = `{ ${node.pkg} { ${node.node} { query(${args.join(', ')}) { totalCount edges { node { ${selection(columns)} } } } } } }`;
  return { ok: true, query: { node, columns, filter, orderBy, limit, graphql } };
}

/** SQL LIKE -> anchored regular expression: % -> .*, _ -> . , other characters escaped. */
export function likeToRegex(pattern: string): string {
  let out = '^';
  for (const ch of pattern) {
    if (ch === '%') out += '.*';
    else if (ch === '_') out += '.';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return `${out}$`;
}

/** {code: 'T107758', amount: {_gte: 10}} : the JSON-like form used in the Sage examples (single quotes). */
export function x3Literal(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const entries = Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x3Literal(x)}`);
  return `{${entries.join(', ')}}`;
}

/** Nested selection set for the columns, always including _id. */
function selection(columns: X3qlColumn[]): string {
  interface Tree {
    [k: string]: Tree;
  }
  const tree: Tree = { _id: {} };
  for (const c of columns) {
    let t = tree;
    for (const seg of c.path) t = t[seg] ??= {};
    if (c.leaf) t[c.leaf] ??= {};
  }
  const render = (t: Tree): string =>
    Object.entries(t)
      .map(([k, sub]) => (Object.keys(sub).length ? `${k} { ${render(sub)} }` : k))
      .join(' ');
  return render(tree);
}

export interface X3qlRows {
  rows: Array<Record<string, CellValue>>;
  totalCount: number | null;
}

export function x3qlRows(query: X3qlQuery, body: unknown): X3qlRows | null {
  const q = (body as { data?: Record<string, Record<string, { query?: { totalCount?: number; edges?: Array<{ node?: Record<string, unknown> }> } }>> })?.data?.[query.node.pkg]?.[
    query.node.node
  ]?.query;
  if (!q || !Array.isArray(q.edges)) return null;
  const rows = q.edges.map((e) => {
    const row: Record<string, CellValue> = {};
    for (const c of query.columns) {
      let v: unknown = e.node;
      for (const seg of c.path) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[seg] : undefined;
      if (c.leaf && v && typeof v === 'object') v = (v as Record<string, unknown>)[c.leaf];
      row[c.name] = v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : (v as CellValue);
    }
    return row;
  });
  return { rows, totalCount: typeof q.totalCount === 'number' ? q.totalCount : null };
}
