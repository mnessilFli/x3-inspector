import { SESSION_GRAPHQL_PATH, validateGraphqlReadOnly } from '@x3i/x3-core';
import type { GraphqlResponse } from '../lib/messages';

const TIMEOUT_MS = 120000;

/**
 * Runs a GraphQL query with the user's X3 session, exactly like the Syracuse GraphiQL explorer:
 * same-origin POST to /xtrem/explorer/, cookies sent by the browser, nothing stored by the extension.
 * Read-only: mutations and subscriptions are refused before any network call.
 */
export async function runSessionGraphql(query: string, variables?: Record<string, unknown>): Promise<GraphqlResponse> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const v = validateGraphqlReadOnly(query);
  if (!v.ok) return { ok: false, status: 0, error: v.errors.map((e) => e.message).join('; '), durationMs: 0 };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(new URL(SESSION_GRAPHQL_PATH, location.origin).toString(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/graphql-response+json, application/json' },
      body: JSON.stringify(variables ? { query, variables } : { query }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON (login page, proxy error): returned as text
    }
    const ok = res.ok && typeof body === 'object' && body !== null && !(body as { errors?: unknown }).errors;
    const r: GraphqlResponse = { ok, status: res.status, body, durationMs: elapsed() };
    if (!res.ok) r.error = `HTTP ${res.status}`;
    else if (typeof body !== 'object') r.error = 'Response is not JSON (session expired?)';
    return r;
  } catch (e) {
    return { ok: false, status: 0, error: ctrl.signal.aborted ? `timeout after ${TIMEOUT_MS / 1000} s` : String(e), durationMs: elapsed() };
  } finally {
    clearTimeout(timer);
  }
}
