import type { X3LocalMenu, X3Table } from '@x3i/shared';
import { ApiError, type CompanionClient } from './companionClient';

/**
 * Per-environment memory cache of table metadata and local menus (side panel lifetime).
 * Keys include the companion URL and env id so two environments never mix.
 */
const tables = new Map<string, Promise<X3Table | null>>();
const menus = new Map<string, Promise<X3LocalMenu | null>>();

function envKey(client: CompanionClient): string {
  return `${client.baseUrl}|${client.envId ?? ''}`;
}

export function getTableCached(client: CompanionClient, table: string): Promise<X3Table | null> {
  const k = `${envKey(client)}|${table.toUpperCase()}`;
  let p = tables.get(k);
  if (!p) {
    p = client.getTable(table).catch((e: unknown) => {
      if (e instanceof ApiError && e.code === 'not-found') return null;
      tables.delete(k);
      throw e;
    });
    tables.set(k, p);
  }
  return p;
}

export function getLocalMenuCached(client: CompanionClient, menu: number): Promise<X3LocalMenu | null> {
  const k = `${envKey(client)}|${menu}`;
  let p = menus.get(k);
  if (!p) {
    p = client.localMenu(menu).catch((e: unknown) => {
      if (e instanceof ApiError && e.code === 'not-found') return null;
      menus.delete(k);
      throw e;
    });
    menus.set(k, p);
  }
  return p;
}

export function clearMetadataCache(): void {
  tables.clear();
  menus.clear();
}
