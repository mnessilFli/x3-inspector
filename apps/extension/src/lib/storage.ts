import { DEFAULT_COMPANION_URL, type ExtensionEnvironment } from '@x3i/shared';
import type { PageRule } from '@x3i/x3-core';

/**
 * Everything lives in chrome.storage.local (never sync). No database password is ever stored;
 * the only sensitive value is the companion pairing token, kept apart under TOKENS_KEY.
 */
export interface Settings {
  environments: ExtensionEnvironment[];
  activeEnvId: string | null;
  defaultMaxRows: number;
  csvSeparator: ',' | ';';
  debug: boolean;
  /** User page rules, tried before the default rules. */
  pageRules: PageRule[];
}

export interface HistoryEntry {
  sql: string;
  envId: string | null;
  at: string;
  rowCount: number | null;
}

export interface Favorite {
  id: string;
  label: string;
  sql: string;
  envId: string | null;
  savedAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  environments: [],
  activeEnvId: null,
  defaultMaxRows: 500,
  csvSeparator: ',',
  debug: false,
  pageRules: [],
};

const SETTINGS_KEY = 'settings';
const TOKENS_KEY = 'companionTokens';
const HISTORY_KEY = 'sqlHistory';
const FAVORITES_KEY = 'sqlFavorites';
const HISTORY_MAX = 100;

async function getKey<T>(key: string, fallback: T): Promise<T> {
  const r = await chrome.storage.local.get(key);
  return (r[key] as T | undefined) ?? fallback;
}

async function setKey<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function loadSettings(): Promise<Settings> {
  const s = await getKey<Partial<Settings>>(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setKey(SETTINGS_KEY, settings);
}

/** Calls back with fresh settings whenever they change (any extension context). */
export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !(SETTINGS_KEY in changes)) return;
    const next = changes[SETTINGS_KEY]?.newValue as Partial<Settings> | undefined;
    cb({ ...DEFAULT_SETTINGS, ...(next ?? {}) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function tokenKeyFor(companionUrl: string): string {
  return companionUrl.trim().replace(/\/+$/, '').toLowerCase();
}

export async function loadToken(companionUrl: string): Promise<string | undefined> {
  const all = await getKey<Record<string, string>>(TOKENS_KEY, {});
  return all[tokenKeyFor(companionUrl)];
}

export async function saveToken(companionUrl: string, token: string): Promise<void> {
  const all = await getKey<Record<string, string>>(TOKENS_KEY, {});
  const k = tokenKeyFor(companionUrl);
  if (token) all[k] = token;
  else delete all[k];
  await setKey(TOKENS_KEY, all);
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  return getKey<HistoryEntry[]>(HISTORY_KEY, []);
}

export async function pushHistory(entry: HistoryEntry): Promise<HistoryEntry[]> {
  const list = (await loadHistory()).filter((h) => h.sql !== entry.sql);
  const next = [entry, ...list].slice(0, HISTORY_MAX);
  await setKey(HISTORY_KEY, next);
  return next;
}

export async function clearHistory(): Promise<void> {
  await setKey(HISTORY_KEY, []);
}

export async function loadFavorites(): Promise<Favorite[]> {
  return getKey<Favorite[]>(FAVORITES_KEY, []);
}

export async function saveFavorites(list: Favorite[]): Promise<void> {
  await setKey(FAVORITES_KEY, list);
}

export function newDefaultEnvironment(): ExtensionEnvironment {
  return {
    id: crypto.randomUUID(),
    name: 'New environment',
    kind: 'DEV',
    x3Url: '',
    folder: '',
    companionUrl: DEFAULT_COMPANION_URL,
    companionEnvId: '',
  };
}
