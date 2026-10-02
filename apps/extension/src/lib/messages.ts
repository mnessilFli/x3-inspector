import type { FieldInspection, X3PageContext } from '@x3i/shared';

/** Requests sent by the side panel or the service worker to the content script. */
export type ContentRequest =
  | { type: 'ping' }
  | { type: 'get-context' }
  | { type: 'set-inspect'; active: boolean }
  | { type: 'toggle-inspect' }
  | { type: 'graphql'; query: string; variables?: Record<string, unknown> }
  | { type: 'get-syracuse-debug' };

/** Answer of the content script to a 'graphql' request (call made with the user's X3 session). */
export interface GraphqlResponse {
  ok: boolean;
  status: number;
  body?: unknown;
  error?: string;
  durationMs: number;
}

export interface PingResponse {
  ok: true;
  frameUrl: string;
  isTopFrame: boolean;
  inspecting: boolean;
}

export interface InspectStateResponse {
  inspecting: boolean;
}

/** Events sent by the content script to extension pages (side panel, service worker). */
export type RuntimeEvent =
  | { type: 'context-changed'; context: X3PageContext }
  | { type: 'field-inspected'; inspection: FieldInspection }
  | { type: 'inspect-state'; active: boolean };

export function isRuntimeEvent(msg: unknown): msg is RuntimeEvent {
  if (typeof msg !== 'object' || msg === null) return false;
  const t = (msg as { type?: unknown }).type;
  return t === 'context-changed' || t === 'field-inspected' || t === 'inspect-state';
}

/** Request from the content script (page launcher) to the service worker. */
export interface OpenPanelRequest {
  type: 'open-side-panel';
}

export function isOpenPanelRequest(msg: unknown): msg is OpenPanelRequest {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'open-side-panel';
}

export function isContentRequest(msg: unknown): msg is ContentRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const t = (msg as { type?: unknown }).type;
  return t === 'ping' || t === 'get-context' || t === 'set-inspect' || t === 'toggle-inspect' || t === 'graphql' || t === 'get-syracuse-debug';
}

/** Sends a request to the top frame of a tab. Resolves undefined when no content script answers. */
export async function sendToTopFrame<T>(tabId: number, request: ContentRequest): Promise<T | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, request, { frameId: 0 })) as T | undefined;
  } catch {
    return undefined;
  }
}

/** Sends a request to every frame of a tab (inspect mode must be active in all frames). */
export async function sendToAllFrames<T>(tabId: number, request: ContentRequest): Promise<T | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, request)) as T | undefined;
  } catch {
    return undefined;
  }
}

/** Fire and forget event to extension pages; no listener is not an error. */
export function emitRuntimeEvent(event: RuntimeEvent): void {
  try {
    chrome.runtime.sendMessage(event).catch(() => undefined);
  } catch {
    // extension context invalidated (extension reloaded): ignore
  }
}
