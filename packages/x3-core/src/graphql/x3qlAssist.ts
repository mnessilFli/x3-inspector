import { getCompletionContext, wordAt } from '../sql/completion';
import { significant, tokenize } from '../sql/tokenizer';
import type { GqlNode, GqlProp, GqlSchemaIndex } from './schemaIndex';
import { findNode, targetNode } from './x3ql';

export interface X3qlSuggestion {
  /** Text inserted in the editor. */
  insert: string;
  label: string;
  /** "X3: BPCNUM · Code · -> BusinessPartner" */
  detail: string;
}

export interface X3qlSuggestions {
  kind: 'objects' | 'fields' | 'none';
  /** SQL keywords that fit the position (and the letters typed). */
  keywords: X3qlSuggestion[];
  /** Replaced range (the word being typed). */
  from: number;
  to: number;
  /** Object whose fields are suggested. */
  node: GqlNode | null;
  items: X3qlSuggestion[];
}

const MAX_ITEMS = 300;

const KEYWORD_HELP: Record<string, string> = {
  SELECT: 'start of the query: list of fields',
  FROM: 'X3 object to read (customer, salesOrder...)',
  WHERE: 'filter: field = value, >=, <=, LIKE',
  AND: 'add a condition (OR is not supported)',
  LIKE: "text pattern: 'KAO%' (% = any text)",
  'ORDER BY': 'sort: field ASC or DESC',
  ASC: 'ascending order',
  DESC: 'descending order',
  LIMIT: 'maximum rows (default 100, max 1000)',
  TRUE: 'boolean value',
  FALSE: 'boolean value',
};

/** Keywords that make sense after the last clause before the cursor. */
function keywordsAt(text: string, from: number, prefix: string): X3qlSuggestion[] {
  const words = significant(tokenize(text.slice(0, from), 'mssql').tokens)
    .filter((t) => t.type === 'word')
    .map((t) => t.upper);
  const last = [...words].reverse().find((w) => ['SELECT', 'FROM', 'WHERE', 'ORDER', 'LIMIT'].includes(w));
  let list: string[];
  if (!last) list = ['SELECT'];
  else if (last === 'SELECT') list = ['FROM'];
  else if (last === 'FROM') list = words[words.length - 1] === 'FROM' ? [] : ['WHERE', 'ORDER BY', 'LIMIT'];
  else if (last === 'WHERE') list = ['AND', 'LIKE', 'TRUE', 'FALSE', 'ORDER BY', 'LIMIT'];
  else if (last === 'ORDER') list = ['ASC', 'DESC', 'LIMIT'];
  else list = [];
  const p = prefix.toUpperCase();
  const all = p ? Object.keys(KEYWORD_HELP).filter((k) => k.startsWith(p) && k !== p) : [];
  const chosen = p ? [...new Set([...list.filter((k) => k.startsWith(p)), ...all])] : list;
  return chosen.map((k) => ({ insert: k === 'TRUE' || k === 'FALSE' ? k.toLowerCase() : k, label: k, detail: KEYWORD_HELP[k] ?? '' }));
}

export function propDetail(p: GqlProp, index?: GqlSchemaIndex): string {
  const parts: string[] = [];
  if (p.x3Field) parts.push(`X3: ${p.x3Field}`);
  if (p.label) parts.push(p.label);
  if (p.kind === 'reference') parts.push(`-> ${index ? (targetNode(index, p)?.node ?? p.typeName) : p.typeName}`);
  else if (p.kind === 'collection') parts.push('sub-collection');
  else parts.push(p.typeName);
  return parts.join(' · ');
}

/** Key X3 field of a node: the X3 code of its first business property (customer -> BPCNUM). */
export function nodeKeyField(node: GqlNode): string | null {
  return node.props.find((p) => p.name !== '_id' && p.kind !== 'other')?.x3Field ?? null;
}

function matches(prefix: string, ...texts: Array<string | null>): boolean {
  if (!prefix) return true;
  const q = prefix.toLowerCase();
  return texts.some((t) => t !== null && t.toLowerCase().includes(q));
}

/**
 * What to suggest at the cursor, like Salesforce Inspector: objects after FROM, fields of the FROM
 * object elsewhere, fields of the referenced object after "reference.". A field matches on its
 * GraphQL name, its X3 code or its label (typing BPRNAM finds companyName1).
 */
export function x3qlSuggestions(text: string, cursor: number, index: GqlSchemaIndex): X3qlSuggestions {
  const ctx = getCompletionContext(text, cursor, 'mssql');
  const to = cursor;
  if (ctx.kind === 'none') return { kind: 'none', keywords: [], from: cursor, to, node: null, items: [] };
  const keywords = ctx.qualifier ? [] : keywordsAt(text, ctx.from, ctx.prefix);

  if (ctx.kind === 'table') {
    const items = index.nodes
      .filter((n) => matches(ctx.prefix, n.node, n.typeName, nodeKeyField(n)))
      .sort((a, b) => a.node.length - b.node.length || a.node.localeCompare(b.node))
      .slice(0, MAX_ITEMS)
      .map((n) => ({ insert: n.node, label: n.node, detail: `${n.pkg}${nodeKeyField(n) ? ` · key ${nodeKeyField(n)}` : ''}` }));
    return { kind: 'objects', keywords: [], from: ctx.from, to, node: null, items };
  }

  const fromRef = ctx.tablesInScope[0];
  const fromNode = fromRef ? (findNode(index, fromRef.schema ? `${fromRef.schema}.${fromRef.table}` : fromRef.table)[0] ?? null) : null;
  if (!fromNode) return { kind: 'none', keywords, from: ctx.from, to, node: null, items: [] };

  let node: GqlNode | null = fromNode;
  if (ctx.kind === 'column' && ctx.qualifier) {
    // reference.prefix: walk the qualifier path (customerCategory.) from the FROM object
    const qualifierPath = qualifierBefore(text, ctx.from);
    node = fromNode;
    for (const seg of qualifierPath) {
      const p: GqlProp | undefined = node?.props.find((x) => x.name.toLowerCase() === seg.toLowerCase());
      node = p ? (targetNode(index, p) ?? null) : null;
      if (!node) break;
    }
  }
  if (!node) return { kind: 'none', keywords, from: ctx.from, to, node: null, items: [] };
  const items = node.props
    .filter((p) => p.kind !== 'other' && p.kind !== 'collection')
    .filter((p) => matches(ctx.prefix, p.name, p.x3Field, p.label))
    .slice(0, MAX_ITEMS)
    .map((p) => ({ insert: p.name, label: p.name, detail: propDetail(p, index) }));
  const afterLimit = /\bLIMIT\s+\S*$/i.test(text.slice(0, to));
  return { kind: afterLimit ? 'none' : 'fields', keywords, from: ctx.from, to, node, items: afterLimit ? [] : items };
}

/** "a.b.pre|" -> ["a", "b"] (identifiers separated by dots, right before `from`). */
function qualifierBefore(text: string, from: number): string[] {
  const before = text.slice(0, from);
  const m = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\.$/.exec(before);
  return m ? (m[1] as string).split('.') : [];
}

/** Hover information for the identifier under `pos`. */
export function x3qlHover(text: string, pos: number, index: GqlSchemaIndex): { title: string; detail: string } | null {
  const w = wordAt(text, pos, 'mssql');
  if (!w) return null;
  const nodes = findNode(index, w.word);
  if (nodes.length === 1 && !w.qualifier) {
    const n = nodes[0] as GqlNode;
    return { title: `${n.pkg}.${n.node}`, detail: `GraphQL object ${n.typeName}${nodeKeyField(n) ? ` · key X3 field ${nodeKeyField(n)}` : ''} · ${n.props.length} properties` };
  }
  const ctx = getCompletionContext(text, w.from, 'mssql');
  const fromRef = ctx.tablesInScope[0];
  let node = fromRef ? (findNode(index, fromRef.table)[0] ?? null) : null;
  for (const seg of w.qualifier ? qualifierBefore(text, w.from) : []) {
    const p = node?.props.find((x) => x.name.toLowerCase() === seg.toLowerCase());
    node = p ? (targetNode(index, p) ?? null) : null;
  }
  const p = node?.props.find((x) => x.name.toLowerCase() === w.word.toLowerCase());
  return p && node ? { title: `${node.node}.${p.name}`, detail: propDetail(p, index) } : null;
}
