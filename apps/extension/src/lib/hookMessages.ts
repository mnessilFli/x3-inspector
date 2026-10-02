import type { SessionResponseInfo, SyracuseFieldRef, SyracuseWindowDictionary } from '@x3i/x3-core';

/** Key of the window.postMessage payload sent by the page hook to the content script. */
export const HOOK_MESSAGE_KEY = '__x3InspectorHook';

export type HookMessage =
  | { kind: 'dictionary'; dictionary: SyracuseWindowDictionary; facet: string }
  | { kind: 'session'; dataset: string; info: SessionResponseInfo; at: number }
  | { kind: 'focus'; dataset: string; field: SyracuseFieldRef; at: number }
  | { kind: 'properties-request'; field: SyracuseFieldRef; at: number };

export function readHookMessage(event: MessageEvent): HookMessage | null {
  if (event.source !== window || event.origin !== location.origin) return null;
  const data = event.data as Record<string, unknown> | null;
  const msg = data && typeof data === 'object' ? (data[HOOK_MESSAGE_KEY] as HookMessage | undefined) : undefined;
  if (!msg || typeof msg !== 'object' || typeof (msg as { kind?: unknown }).kind !== 'string') return null;
  return msg;
}
