import { useCallback, useState } from 'react';
import { CustomBadge } from '../../components/provenance';
import { Card, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { useSettings } from '../../state/SettingsContext';
import { useDebouncedSearch } from './useDebouncedSearch';

/** Universal search in the X3 dictionary: tables, fields, screens, functions. */
export function SearchView() {
  const { client } = useSettings();
  const nav = useNav();
  const [q, setQ] = useState('');
  const fn = useCallback((query: string) => (client ? client.search(query, 30) : Promise.reject(new Error('no environment'))), [client]);
  const { data, error, loading } = useDebouncedSearch(q, client ? fn : null);

  return (
    <>
      <Card title="Search the X3 dictionary">
        <input className="input" placeholder="BPCNUM, Client, ZIDSF..." value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && <Spinner />}
        {error && <Message kind="error">{error}</Message>}
        {!client && <p className="small muted">Configure an environment first (TOOLS &gt; Settings).</p>}
      </Card>
      {data && (
        <>
          <Card title={`Tables (${data.tables.length})`}>
            <ul className="list">
              {data.tables.map((t) => (
                <li key={t.name}>
                  <button type="button" className="link mono" onClick={() => nav.openTable(t.name)}>
                    {t.name}
                  </button>
                  {t.abbreviation && <span className="muted mono"> {t.abbreviation.value}</span>}
                  {t.description && <span className="muted"> · {t.description.value}</span>} <CustomBadge flag={t.custom} compact={t.custom.level === 'standard'} />
                </li>
              ))}
              {data.tables.length === 0 && <li className="muted">No table.</li>}
            </ul>
          </Card>
          <Card title={`Fields (${data.fields.length})`}>
            <ul className="list">
              {data.fields.map((f) => (
                <li key={`${f.table}.${f.field}`}>
                  <button type="button" className="link mono" onClick={() => nav.openField(f.field, f.table)}>
                    {f.table}.{f.field}
                  </button>
                  {f.label && <span className="muted"> · {f.label.value}</span>}
                  <span className="muted small"> ({f.matchedOn === 'label' ? 'label match' : f.columns.join(', ')})</span>
                  {f.custom.level !== 'standard' && (
                    <>
                      {' '}
                      <CustomBadge flag={f.custom} />
                    </>
                  )}
                </li>
              ))}
              {data.fields.length === 0 && <li className="muted">No field.</li>}
            </ul>
          </Card>
          <Card title={`Screens (${data.screens.length})`}>
            <ul className="list">
              {data.screens.map((s, i) => (
                <li key={i} className="mono">
                  {s.screen}.{s.field}
                </li>
              ))}
              {data.screens.length === 0 && <li className="muted">No screen field.</li>}
            </ul>
          </Card>
          <Card title={`Functions (${data.functions.length})`}>
            <ul className="list">
              {data.functions.map((f) => (
                <li key={f.code} className="mono">
                  {f.code}
                  {f.object && <span className="muted"> · object {f.object}</span>}
                </li>
              ))}
              {data.functions.length === 0 && <li className="muted">No function.</li>}
            </ul>
          </Card>
          {data.unavailable.length > 0 && (
            <Message kind="info">
              Not searched:
              <ul>
                {data.unavailable.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </Message>
          )}
        </>
      )}
    </>
  );
}
