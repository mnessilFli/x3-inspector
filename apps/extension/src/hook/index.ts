import { ACT_FIELD_PROPERTIES, parsePagesUrl, parsePrototype, parseSessionRequest, parseSessionResponse, parseSessionsUrl } from '@x3i/x3-core';
import { HOOK_MESSAGE_KEY, type HookMessage } from '../lib/hookMessages';

/**
 * Runs in the PAGE world (manifest "world": "MAIN") at document_start, before Syracuse scripts.
 * Wraps window.fetch to OBSERVE, read only, two kinds of Syracuse calls:
 *  - pages('x3.erp.<DATASET>.<WINDOW>.$fusion...') : screen description (fields, labels, local menus)
 *  - /trans/x3/erp/<DATASET>/$sessions...         : opened windows and field focus changes
 * Requests and responses are passed through untouched (responses are cloned before reading).
 * Nothing leaves the page: findings are posted to the extension content script of the same page.
 */
declare global {
  interface Window {
    __x3InspectorHook?: boolean;
  }
}

function post(msg: HookMessage): void {
  window.postMessage({ [HOOK_MESSAGE_KEY]: msg }, location.origin);
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function bodyOf(input: RequestInfo | URL, init: RequestInit | undefined): Promise<string | null> {
  if (typeof init?.body === 'string') return init.body;
  if (input instanceof Request) return input.clone().text();
  return null;
}

function observe(input: RequestInfo | URL, init: RequestInit | undefined, pending: Promise<Response>): void {
  const url = urlOf(input);
  const pages = parsePagesUrl(url);
  if (pages) {
    void pending
      .then((r) => (r.ok ? r.clone().json() : null))
      .then((json) => {
        const dictionary = json ? parsePrototype(json, pages.dataset, pages.window) : null;
        if (dictionary) post({ kind: 'dictionary', dictionary, facet: pages.facet });
      })
      .catch(() => undefined);
    return;
  }
  const sessions = parseSessionsUrl(url);
  if (!sessions) return;
  void bodyOf(input, init)
    .then((body) => {
      const req = body ? parseSessionRequest(body) : null;
      if (req?.entered) post({ kind: 'focus', dataset: sessions.dataset, field: req.entered, at: Date.now() });
      if (req?.act === ACT_FIELD_PROPERTIES && req.left) post({ kind: 'properties-request', field: req.left, at: Date.now() });
    })
    .catch(() => undefined);
  void pending
    .then((r) => (r.ok ? r.clone().json() : null))
    .then((json) => {
      const info = json ? parseSessionResponse(json) : null;
      if (info) post({ kind: 'session', dataset: sessions.dataset, info, at: Date.now() });
    })
    .catch(() => undefined);
}

if (!window.__x3InspectorHook && typeof window.fetch === 'function') {
  window.__x3InspectorHook = true;
  const original = window.fetch;
  const wrapped = function (this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const pending = original.call(this ?? window, input, init);
    try {
      observe(input, init, pending);
    } catch {
      // observation must never break X3
    }
    return pending;
  };
  window.fetch = wrapped as typeof window.fetch;
}
