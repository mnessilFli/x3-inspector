import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../../lib/companionClient';

/** Runs fn(query) after a pause in typing; keeps only the latest answer. */
export function useDebouncedSearch<T>(query: string, fn: ((q: string) => Promise<T>) | null, delayMs = 300) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q || !fn) {
      setData(null);
      setLoading(false);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      fn(q)
        .then((r) => {
          if (n === seq.current) {
            setData(r);
            setError(null);
          }
        })
        .catch((e: unknown) => n === seq.current && setError(errorMessage(e)))
        .finally(() => n === seq.current && setLoading(false));
    }, delayMs);
    return () => clearTimeout(t);
  }, [query, fn, delayMs]);

  return { data, error, loading };
}
