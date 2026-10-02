import { buildSchemaIndex, indexFromNodes, INTROSPECTION_QUERY, type GqlNode, type GqlSchemaIndex } from '@x3i/x3-core';
import { createLogger } from './logger';
import { runGraphqlInActiveTab } from './sessionGraphql';

const log = createLogger('gql-index');
const memory = new Map<string, Promise<GqlSchemaIndex>>();

interface Stored {
  savedAt: string;
  nodes: GqlNode[];
}

const storageKey = (scope: string) => `x3i.gqlIndex.${scope}`;

/** Every view using the schema is told when it becomes available, whichever view loaded it. */
const listeners = new Set<(scope: string, index: GqlSchemaIndex) => void>();
export function onSchemaIndex(listener: (scope: string, index: GqlSchemaIndex) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function publish(scope: string, p: Promise<GqlSchemaIndex>): void {
  p.then((index) => listeners.forEach((l) => l(scope, index))).catch(() => undefined);
}

/** Index already in memory or in storage, without any network call. null when never loaded. */
export async function peekSchemaIndex(scope: string): Promise<GqlSchemaIndex | null> {
  const cached = memory.get(scope);
  if (cached) return cached.catch(() => null);
  const stored = (await chrome.storage.local.get(storageKey(scope)))[storageKey(scope)] as Stored | undefined;
  if (!stored?.nodes?.length) return null;
  const index = indexFromNodes(stored.nodes);
  memory.set(scope, Promise.resolve(index));
  publish(scope, Promise.resolve(index));
  return index;
}

/** origin|dataset of an X3 page, the scope of a schema index. */
export function schemaScope(url: string | undefined, dataset: string | null | undefined): string {
  try {
    return `${new URL(url ?? '').origin}|${dataset ?? ''}`;
  } catch {
    return '';
  }
}

/**
 * Schema index of one X3 endpoint (scope = origin + endpoint dataset). The full introspection is
 * about 22 MB on X3 Cloud: it is fetched once, then only the compact index (about 1.5 MB) is kept
 * in chrome.storage.local. No business data is stored.
 */
export function getSchemaIndex(scope: string, refresh = false): Promise<GqlSchemaIndex> {
  if (!refresh) {
    const cached = memory.get(scope);
    if (cached) return cached;
  }
  const p = (async () => {
    if (!refresh) {
      const stored = (await chrome.storage.local.get(storageKey(scope)))[storageKey(scope)] as Stored | undefined;
      if (stored?.nodes?.length) {
        log.debug(`schema index from storage (${stored.nodes.length} nodes, ${stored.savedAt})`);
        return indexFromNodes(stored.nodes);
      }
    }
    const r = await runGraphqlInActiveTab(INTROSPECTION_QUERY);
    if (!r.ok) throw new Error(r.error ?? `GraphQL introspection failed (HTTP ${r.status})`);
    const index = buildSchemaIndex(r.body);
    if (!index) throw new Error('Unexpected introspection answer');
    const value: Stored = { savedAt: new Date().toISOString(), nodes: index.nodes };
    await chrome.storage.local.set({ [storageKey(scope)]: value });
    log.debug(`schema index built (${index.nodes.length} nodes)`);
    return index;
  })();
  memory.set(scope, p);
  p.catch(() => memory.delete(scope));
  publish(scope, p);
  return p;
}
