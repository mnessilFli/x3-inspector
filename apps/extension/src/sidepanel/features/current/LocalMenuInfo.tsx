import type { X3LocalMenu } from '@x3i/shared';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../../lib/companionClient';
import { getLocalMenuCached } from '../../../lib/metadataCache';
import { Collapsible } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';

export function useLocalMenu(menu: number | undefined): { menu: X3LocalMenu | null; error: string | null } {
  const { client } = useSettings();
  const [data, setData] = useState<X3LocalMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setError(null);
    if (menu === undefined || !client) return;
    let cancelled = false;
    getLocalMenuCached(client, menu)
      .then((m) => !cancelled && setData(m))
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [menu, client]);
  return { menu: data, error };
}

/** "2 - Active" display of a raw local menu value, or the raw value when the label is unknown. */
export function menuLabel(menu: X3LocalMenu | null | undefined, raw: unknown): string | undefined {
  if (!menu || raw === null || raw === undefined) return undefined;
  const n = Number(raw);
  const v = menu.values.find((x) => x.value === n);
  return v ? `${n} - ${v.label}` : undefined;
}

export function LocalMenuInfo({ menu }: { menu: number }) {
  const { menu: data, error } = useLocalMenu(menu);
  if (error) return <span className="src">Menu values unavailable: {error}</span>;
  if (!data) return <span className="src">Menu values unknown (local menu dictionary not resolved)</span>;
  return (
    <Collapsible summary={`${data.values.length} values (${data.language})`}>
      <ul className="list">
        {data.values.map((v) => (
          <li key={v.value}>
            <span className="mono">{v.value}</span> - {v.label}
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}
