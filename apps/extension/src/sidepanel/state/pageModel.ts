import { bestOf, known, unknown, type Sourced, type X3PageContext } from '@x3i/shared';
import type { PageResolution } from '@x3i/x3-core';

export const CONTEXT_KEYS = ['dataset', 'folder', 'functionCode', 'object', 'window', 'screen', 'mainTable', 'abbreviation'] as const;
export type ContextKey = (typeof CONTEXT_KEYS)[number];

export const CONTEXT_LABELS: Record<ContextKey, string> = {
  dataset: 'Endpoint dataset',
  folder: 'Folder',
  functionCode: 'Function',
  object: 'Object',
  window: 'Window',
  screen: 'Screen',
  mainTable: 'Table',
  abbreviation: 'Alias',
};

export type Overrides = Partial<Record<ContextKey, string>>;
export type EffectiveContext = Record<ContextKey, Sourced<string>>;

function manual(v: string): Sourced<string> {
  return known(v.trim().toUpperCase(), 'manual', 'EXACT', 'set by the user');
}

/** Detected context + metadata resolution + manual overrides, with provenance for each value. */
export function effectiveContext(ctx: X3PageContext | null, res: PageResolution | null, overrides: Overrides): EffectiveContext {
  const none = (what: string) => unknown<string>(ctx ? `${what} not detected` : 'screen not inspected yet');
  const base: EffectiveContext = {
    dataset: ctx?.dataset ?? none('dataset'),
    folder: ctx?.folder ?? none('folder'),
    functionCode: ctx?.functionCode ?? none('function'),
    object: ctx || res ? bestOf(ctx?.object, res?.object) : none('object'),
    window: ctx?.window ?? none('window'),
    screen: ctx?.screen ?? none('screen'),
    mainTable:
      res?.mainTable ??
      unknown(
        ctx
          ? 'not exposed on X3 Cloud: neither the Syracuse messages nor GraphQL give table names (on-premise: companion + SQL dictionary)'
          : 'screen not inspected yet',
      ),
    abbreviation: res?.abbreviation ?? unknown('main table unknown'),
  };
  for (const k of CONTEXT_KEYS) {
    const o = overrides[k];
    if (o && o.trim()) base[k] = manual(o);
  }
  return base;
}

export function resolutionInputKey(e: EffectiveContext): string {
  return [e.functionCode.value, e.object.value, e.screen.value].join('|');
}
