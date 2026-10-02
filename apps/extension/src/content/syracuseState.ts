import type { SyracuseFieldInfo } from '@x3i/shared';
import { matchFieldByClues, parseFieldPropertiesBox, type DomFieldClues, type SyracuseFieldDef, type SyracuseFieldRef, type SyracuseWindowDictionary } from '@x3i/x3-core';
import { readHookMessage } from '../lib/hookMessages';

export interface DictionaryCapture {
  window: string;
  facet: string;
  object: string | null;
  keyX3Names: string[];
  fields: number;
  at: string;
}

export interface SyracuseDebug {
  hookSeen: boolean;
  windows: Record<string, string>;
  currentWindow: string | null;
  lastFocus: { win: string; xid: string; at: string; x3Name: string | null } | null;
  captures: DictionaryCapture[];
  merged: Array<{ window: string; object: string | null; keyX3Names: string[]; fields: number }>;
}

interface Focus {
  field: SyracuseFieldRef;
  at: number;
}

/** What the page hook observed: screen descriptions, opened windows, field focus. Top frame only. */
export class SyracuseState {
  private readonly dictionaries = new Map<string, SyracuseWindowDictionary>();
  /** Window letter (B) -> window code (OBPC) for the current session. */
  private readonly windows = new Map<string, string>();
  private lastWindowLetter: string | null = null;
  private focus: Focus | null = null;
  private readonly captures: DictionaryCapture[] = [];
  private pendingProperties: { field: SyracuseFieldRef; at: number } | null = null;
  private readonly properties = new Map<string, NonNullable<import('@x3i/shared').FieldInspection['x3Properties']>>();
  private readonly propertiesListeners = new Set<(field: SyracuseFieldRef) => void>();
  private readonly focusListeners = new Set<(f: Focus) => void>();
  hookSeen = false;

  constructor() {
    window.addEventListener('message', (e) => {
      const msg = readHookMessage(e);
      if (!msg) return;
      this.hookSeen = true;
      if (msg.kind === 'dictionary') {
        const d = msg.dictionary;
        this.captures.push({ window: d.window, facet: msg.facet, object: d.object, keyX3Names: d.keyX3Names, fields: Object.keys(d.fields).length, at: new Date().toISOString() });
        if (this.captures.length > 30) this.captures.shift();
        // several descriptions of the same window may arrive: merge, never lose the object or the key
        const old = this.dictionaries.get(d.window);
        this.dictionaries.set(
          d.window,
          old
            ? {
                ...d,
                fields: { ...old.fields, ...d.fields },
                object: d.object ?? old.object,
                keyX3Names: d.keyX3Names.length ? d.keyX3Names : old.keyX3Names,
              }
            : d,
        );
      } else if (msg.kind === 'properties-request') {
        this.pendingProperties = { field: msg.field, at: msg.at };
      } else if (msg.kind === 'session') {
        const pending = this.pendingProperties;
        if (msg.info.box && pending && msg.at - pending.at < 10000) {
          const p = parseFieldPropertiesBox(msg.info.box);
          this.properties.set(`${pending.field.win}:${pending.field.xid}`, { title: p.title, entries: p.entries });
          this.pendingProperties = null;
          for (const l of this.propertiesListeners) l(pending.field);
        }
        for (const [letter, name] of Object.entries(msg.info.windows)) {
          this.windows.set(letter, name);
          this.lastWindowLetter = letter;
        }
      } else if (msg.kind === 'focus') {
        this.focus = { field: msg.field, at: msg.at };
        for (const l of this.focusListeners) l(this.focus);
      }
    });
  }

  onProperties(listener: (field: SyracuseFieldRef) => void): () => void {
    this.propertiesListeners.add(listener);
    return () => this.propertiesListeners.delete(listener);
  }

  propertiesOf(ref: SyracuseFieldRef) {
    return this.properties.get(`${ref.win}:${ref.xid}`) ?? null;
  }

  onFocus(listener: (f: Focus) => void): () => void {
    this.focusListeners.add(listener);
    return () => this.focusListeners.delete(listener);
  }

  get lastFocus(): Focus | null {
    return this.focus;
  }

  /** Waits for a focus message sent after `since` (ms epoch). */
  waitForFocus(since: number, timeoutMs: number): Promise<Focus | null> {
    if (this.focus && this.focus.at >= since) return Promise.resolve(this.focus);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(null);
      }, timeoutMs);
      const off = this.onFocus((f) => {
        if (f.at < since) return;
        clearTimeout(timer);
        off();
        resolve(f);
      });
    });
  }

  windowOf(letter: string): string | null {
    return this.windows.get(letter) ?? null;
  }

  /** Window of the current function: the last one opened in the session. */
  get currentWindow(): string | null {
    return this.lastWindowLetter ? (this.windows.get(this.lastWindowLetter) ?? null) : null;
  }

  dictionary(windowCode: string | null): SyracuseWindowDictionary | null {
    return windowCode ? (this.dictionaries.get(windowCode) ?? null) : null;
  }

  fieldInfo(ref: SyracuseFieldRef): SyracuseFieldInfo | null {
    const windowCode = this.windowOf(ref.win);
    const def = this.dictionary(windowCode)?.fields[ref.xid];
    const dict = this.dictionary(windowCode);
    return def && dict ? toInfo(def, dict, ref.win, windowCode, 'focus', []) : null;
  }

  /** Fallback without focus: match label / type / length in the current window. */
  matchByClues(clues: DomFieldClues): SyracuseFieldInfo | null {
    const windowCode = this.currentWindow;
    const dict = this.dictionary(windowCode);
    if (!dict) return null;
    const hits = matchFieldByClues(dict, clues);
    const first = hits[0];
    if (!first) return null;
    const letter = [...this.windows.entries()].find(([, w]) => w === windowCode)?.[0] ?? '?';
    return toInfo(first, dict, letter, windowCode, 'clues', hits.slice(1).map((h) => h.x3Name));
  }

  debug(): SyracuseDebug {
    const f = this.focus;
    return {
      hookSeen: this.hookSeen,
      windows: Object.fromEntries(this.windows),
      currentWindow: this.currentWindow,
      lastFocus: f ? { win: f.field.win, xid: f.field.xid, at: new Date(f.at).toISOString(), x3Name: this.fieldInfo(f.field)?.x3Name ?? null } : null,
      captures: [...this.captures],
      merged: [...this.dictionaries.values()].map((d) => ({ window: d.window, object: d.object, keyX3Names: d.keyX3Names, fields: Object.keys(d.fields).length })),
    };
  }

  fieldCount(windowCode: string | null): number {
    return Object.keys(this.dictionary(windowCode)?.fields ?? {}).length;
  }
}

function toInfo(def: SyracuseFieldDef, dict: SyracuseWindowDictionary, win: string, windowCode: string | null, how: SyracuseFieldInfo['how'], alternatives: string[]): SyracuseFieldInfo {
  return {
    xid: def.xid,
    win,
    window: windowCode,
    x3Name: def.x3Name,
    screen: def.screen,
    field: def.field,
    label: def.label,
    type: def.type,
    localMenu: def.localMenu,
    maxLength: def.maxLength,
    format: def.format,
    object: dict.object,
    isKey: dict.keyX3Names.includes(def.x3Name),
    how,
    alternatives,
  };
}
