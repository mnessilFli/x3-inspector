import type { GqlSchemaIndex } from '@x3i/x3-core';
import { useCallback, useEffect, useState } from 'react';
import { getSchemaIndex, onSchemaIndex, peekSchemaIndex, schemaScope } from '../../lib/gqlSchemaIndex';
import { usePage } from './PageContext';

export interface SchemaIndexState {
  index: GqlSchemaIndex | null;
  loading: boolean;
  error: string | null;
  scope: string;
  /** Loads from X3 (first time about 20 s); refresh=true ignores the stored copy. */
  load(refresh?: boolean): Promise<GqlSchemaIndex | null>;
}

/** GraphQL schema index of the X3 page in the active tab: memory, then storage, then X3 on demand. */
export function useSchemaIndex(): SchemaIndexState {
  const { context } = usePage();
  const scope = schemaScope(context?.url, context?.dataset.value);
  const [index, setIndex] = useState<GqlSchemaIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIndex(null);
    if (!scope) return;
    void peekSchemaIndex(scope).then((i) => !cancelled && i && setIndex(i));
    const off = onSchemaIndex((s, i) => {
      if (!cancelled && s === scope) setIndex(i);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [scope]);

  const load = useCallback(
    async (refresh = false) => {
      if (!scope) {
        setError('Open a Sage X3 page first, then CURRENT > Screen > Inspect current X3 screen.');
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const i = await getSchemaIndex(scope, refresh);
        setIndex(i);
        return i;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [scope],
  );

  return { index, loading, error, scope, load };
}
