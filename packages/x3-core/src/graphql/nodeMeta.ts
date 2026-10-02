/**
 * Property metadata of a GraphQL node through the xtremMetadata package (present on X3 Cloud,
 * schema export of 2026-10-02): MetaNodeFactory { name, title, storage, properties { query } } and
 * MetaNodeProperty { name, title, type, isStored, isRequired, isNullable, targetFactory { name } }.
 * Assumption to verify on the first call: MetaNodeFactory.name equals the GraphQL type name (Customer).
 */

export interface PropMeta {
  name: string;
  title: string | null;
  type: string | null;
  isStored: boolean | null;
  isRequired: boolean | null;
  isNullable: boolean | null;
  target: string | null;
}

export interface NodeMeta {
  factory: string;
  title: string | null;
  storage: string | null;
  props: Map<string, PropMeta>;
}

export function buildNodeMetaQuery(factoryName: string): string {
  const filter = JSON.stringify(`{name: '${factoryName.replace(/'/g, "\\'")}'}`);
  return `{ xtremMetadata { metaNodeFactory { query(first: 1, filter: ${filter}) { edges { node { name title storage properties { query(first: 1000) { edges { node { name title type isStored isRequired isNullable targetFactory { name } } } } } } } } } } }`;
}

export function parseNodeMeta(body: unknown): NodeMeta | null {
  const edge = (body as { data?: { xtremMetadata?: { metaNodeFactory?: { query?: { edges?: Array<{ node?: Record<string, unknown> }> } } } } })?.data?.xtremMetadata?.metaNodeFactory?.query?.edges?.[0]?.node;
  if (!edge) return null;
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  const b = (v: unknown) => (typeof v === 'boolean' ? v : null);
  const props = new Map<string, PropMeta>();
  const list = ((edge.properties as { query?: { edges?: Array<{ node?: Record<string, unknown> }> } })?.query?.edges ?? []).map((e) => e.node ?? {});
  for (const p of list) {
    const name = s(p.name);
    if (!name) continue;
    props.set(name, {
      name,
      title: s(p.title),
      type: s(p.type),
      isStored: b(p.isStored),
      isRequired: b(p.isRequired),
      isNullable: b(p.isNullable),
      target: s((p.targetFactory as { name?: unknown } | null)?.name),
    });
  }
  return { factory: s(edge.name) ?? '', title: s(edge.title), storage: s(edge.storage), props };
}
