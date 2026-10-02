/**
 * Index of the X3 GraphQL schema built from a standard introspection result.
 * Verified on X3 Cloud (2026-10-02): 696 readable nodes, 12 567 properties, 90 % of them describe
 * their X3 field in the description: "Code (BPCNUM)", "Company name 1 (BPRNAM)".
 * Node layout: query { <package> { <node> { read(_id: ID) { ... } query(...) { ... } } } }
 */

export type GqlPropKind = 'scalar' | 'enum' | 'reference' | 'text' | 'collection' | 'other';

export interface GqlProp {
  name: string;
  /** X3 field code read from the description "(BPCNUM)", null when absent. */
  x3Field: string | null;
  /** Description without the trailing "(CODE)". */
  label: string;
  kind: GqlPropKind;
  typeName: string;
}

export interface GqlNode {
  pkg: string;
  node: string;
  typeName: string;
  props: GqlProp[];
}

export interface GqlSchemaIndex {
  nodes: GqlNode[];
  /** X3 field code -> properties carrying it. */
  byX3Field: Map<string, Array<{ node: GqlNode; prop: GqlProp }>>;
}

interface TypeRef {
  kind: string;
  name: string | null;
  ofType?: TypeRef | null;
}
interface IntroField {
  name: string;
  description?: string | null;
  type: TypeRef;
}
interface IntroType {
  kind: string;
  name: string;
  fields?: IntroField[] | null;
}

const X3_CODE = /\(([A-Z][A-Z0-9_]{1,15})\)\s*$/;

function leaf(t: TypeRef): { type: TypeRef; list: boolean } {
  let cur = t;
  let list = false;
  while (cur.ofType) {
    if (cur.kind === 'LIST') list = true;
    cur = cur.ofType;
  }
  return { type: cur, list };
}

export function buildSchemaIndex(introspection: unknown): GqlSchemaIndex | null {
  const schema = (introspection as { data?: { __schema?: { queryType?: { name?: string }; types?: IntroType[] } } })?.data?.__schema;
  if (!schema?.types || !schema.queryType?.name) return null;
  const types = new Map(schema.types.map((t) => [t.name, t]));
  const fieldNames = (name: string | null) => new Set((types.get(name ?? '')?.fields ?? []).map((f) => f.name));
  const root = types.get(schema.queryType.name);
  const nodes: GqlNode[] = [];
  const byX3Field = new Map<string, Array<{ node: GqlNode; prop: GqlProp }>>();

  for (const pkg of root?.fields ?? []) {
    for (const nodeField of types.get(leaf(pkg.type).type.name ?? '')?.fields ?? []) {
      const read = (types.get(leaf(nodeField.type).type.name ?? '')?.fields ?? []).find((f) => f.name === 'read');
      if (!read) continue;
      const nodeType = types.get(leaf(read.type).type.name ?? '');
      if (!nodeType?.fields) continue;
      const node: GqlNode = { pkg: pkg.name, node: nodeField.name, typeName: nodeType.name, props: [] };
      for (const f of nodeType.fields) {
        if (f.name.startsWith('_') && f.name !== '_id') continue;
        const { type, list } = leaf(f.type);
        const names = type.kind === 'OBJECT' ? fieldNames(type.name) : new Set<string>();
        let kind: GqlPropKind = 'other';
        if (!list && type.kind === 'SCALAR') kind = 'scalar';
        else if (!list && type.kind === 'ENUM') kind = 'enum';
        else if (!list && names.has('query')) kind = 'collection';
        else if (!list && names.has('_id')) kind = 'reference';
        else if (!list && names.has('value') && names.size === 1) kind = 'text';
        const desc = (f.description ?? '').trim();
        const m = X3_CODE.exec(desc);
        const prop: GqlProp = { name: f.name, x3Field: m ? (m[1] as string) : null, label: m ? desc.slice(0, m.index).trim() : desc, kind, typeName: type.name ?? '' };
        node.props.push(prop);
        if (prop.x3Field) {
          const list2 = byX3Field.get(prop.x3Field) ?? [];
          list2.push({ node, prop });
          byX3Field.set(prop.x3Field, list2);
        }
      }
      nodes.push(node);
    }
  }
  return { nodes, byX3Field };
}

/** Rebuilds the field lookup from stored nodes (the nodes array is what gets cached). */
export function indexFromNodes(nodes: GqlNode[]): GqlSchemaIndex {
  const byX3Field = new Map<string, Array<{ node: GqlNode; prop: GqlProp }>>();
  for (const node of nodes) {
    for (const prop of node.props) {
      if (!prop.x3Field) continue;
      const list = byX3Field.get(prop.x3Field) ?? [];
      list.push({ node, prop });
      byX3Field.set(prop.x3Field, list);
    }
  }
  return { nodes, byX3Field };
}

/** Screen field BPRNAM_1 -> dictionary field BPRNAM (occurrence suffix removed). */
export function baseX3Field(field: string): string {
  return field.replace(/_\d+$/, '');
}

export interface NodeCandidate {
  node: GqlNode;
  prop: GqlProp;
  score: number;
}

/**
 * Nodes that may hold the record identified by a key field (e.g. BPCNUM -> x3MasterData.customer.code).
 * Heuristic ordering only: the caller tries them with read(_id) and keeps the first that answers.
 */
export function nodeCandidatesForKeyField(index: GqlSchemaIndex, field: string): NodeCandidate[] {
  const hits = index.byX3Field.get(baseX3Field(field)) ?? [];
  return hits
    .map(({ node, prop }) => {
      let score = 0;
      if (prop.name === 'code' || prop.name === '_id') score += 10;
      if (node.props.find((p) => p.kind !== 'other' && p.name !== '_id') === prop) score += 5; // first business property = key
      if (node.pkg === 'x3MasterData') score += 2;
      score -= node.node.length / 10; // customer before customerSalesReps
      return { node, prop, score };
    })
    .sort((a, b) => b.score - a.score);
}

/** read(_id) query selecting scalars, enums, texts and the _id of references. Collections are not read. */
export function buildReadQuery(node: GqlNode, id: string): string {
  const sel = node.props
    .map((p) => {
      switch (p.kind) {
        case 'scalar':
        case 'enum':
          return p.name;
        case 'reference':
          return `${p.name} { _id }`;
        case 'text':
          return `${p.name} { value }`;
        default:
          return null;
      }
    })
    .filter((s): s is string => s !== null);
  return `{ ${node.pkg} { ${node.node} { read(_id: ${JSON.stringify(id)}) { ${sel.join(' ')} } } } }`;
}

export interface RecordRow {
  prop: string;
  x3Field: string | null;
  label: string;
  kind: GqlPropKind;
  value: string | null;
}

/** Extracts the record object from a read() answer. */
export function readResult(node: GqlNode, body: unknown): Record<string, unknown> | null {
  const r = (body as { data?: Record<string, Record<string, { read?: unknown }>> })?.data?.[node.pkg]?.[node.node]?.read;
  return r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
}

export function recordRows(node: GqlNode, record: Record<string, unknown>): RecordRow[] {
  return node.props
    .filter((p) => p.kind !== 'other')
    .map((p) => {
      const raw = record[p.name];
      let value: string | null = null;
      if (p.kind === 'collection') value = null;
      else if (raw === null || raw === undefined) value = null;
      else if (p.kind === 'reference') value = String((raw as { _id?: unknown })._id ?? '');
      else if (p.kind === 'text') value = String((raw as { value?: unknown }).value ?? '');
      else value = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
      return { prop: p.name, x3Field: p.x3Field, label: p.label, kind: p.kind, value };
    });
}
