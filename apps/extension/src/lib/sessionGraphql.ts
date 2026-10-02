import type { GraphqlResponse } from './messages';
import { sendToTopFrame } from './messages';
import { ensureContentScript, getActiveTab } from './tabs';

/** Sends a GraphQL query to the content script of the active X3 tab, which calls X3 with the user's session. */
export async function runGraphqlInActiveTab(query: string, variables?: Record<string, unknown>): Promise<GraphqlResponse> {
  const tab = await getActiveTab();
  if (tab?.id === undefined) return { ok: false, status: 0, error: 'No active tab', durationMs: 0 };
  if (!(await ensureContentScript(tab.id))) {
    return { ok: false, status: 0, error: 'The active tab is not a Sage X3 page reachable by X3 Inspector', durationMs: 0 };
  }
  const request = variables ? { type: 'graphql' as const, query, variables } : { type: 'graphql' as const, query };
  const r = await sendToTopFrame<GraphqlResponse>(tab.id, request);
  return r ?? { ok: false, status: 0, error: 'No answer from the X3 page (reload the X3 tab with F5)', durationMs: 0 };
}
