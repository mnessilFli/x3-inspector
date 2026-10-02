import type { FieldInspection, X3Table } from '@x3i/shared';
import { resolveInspectedField, type ResolvedField } from '@x3i/x3-core';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../../lib/companionClient';
import { getTableCached } from '../../../lib/metadataCache';
import { useSettings } from '../../state/SettingsContext';

export interface ResolvedFieldState {
  table: X3Table | null;
  tableError: string | null;
  loading: boolean;
  resolved: ResolvedField | null;
}

/** Loads the main table and confirms the inspected element's candidates against its fields. */
export function useResolvedField(inspection: FieldInspection | null, tableName: string | null): ResolvedFieldState {
  const { client } = useSettings();
  const [table, setTable] = useState<X3Table | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTable(null);
    setTableError(null);
    if (!tableName || !client || !client.hasToken) return;
    let cancelled = false;
    setLoading(true);
    getTableCached(client, tableName)
      .then((t) => {
        if (cancelled) return;
        setTable(t);
        if (!t) setTableError(`Table ${tableName} not found in the folder schema`);
      })
      .catch((e: unknown) => !cancelled && setTableError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tableName, client]);

  const resolved = inspection ? resolveInspectedField(inspection, table) : null;
  return { table, tableError, loading, resolved };
}
