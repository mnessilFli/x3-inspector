import type { X3Field, X3FieldHit, X3FieldUsage } from '@x3i/shared';
import { tableFieldSyntax } from '@x3i/x3-core';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../../lib/companionClient';
import { getTableCached } from '../../../lib/metadataCache';
import { AttrValue, CustomBadge, InfoRow } from '../../components/provenance';
import { Button, Card, CopyButton, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { useSettings } from '../../state/SettingsContext';
import { useDebouncedSearch } from './useDebouncedSearch';

interface Selected {
  table: string;
  field: string;
}

/** Field Explorer: find a field by name or label, show its metadata and where it is used. */
export function FieldExplorer() {
  const { client } = useSettings();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Selected | null>(null);
  const fn = useCallback((query: string) => (client ? client.search(query, 40) : Promise.reject(new Error('no environment'))), [client]);
  const { data, error, loading } = useDebouncedSearch(q, client ? fn : null);

  useEffect(() => {
    const it = nav.fieldIntent;
    if (!it) return;
    setQ(it.field);
    if (it.table) setSelected({ table: it.table, field: it.field });
  }, [nav.fieldIntent]);

  return (
    <>
      <Card title="Field Explorer">
        <input className="input" placeholder="Field name or label (BPCNUM, Salesforce...)" value={q} onChange={(e) => setQ(e.target.value)} />
        {loading && <Spinner />}
        {error && <Message kind="error">{error}</Message>}
        {data && (
          <ul className="list" style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
            {data.fields.map((f: X3FieldHit) => (
              <li key={`${f.table}.${f.field}`}>
                <button type="button" className="link mono" onClick={() => setSelected({ table: f.table, field: f.field })}>
                  {f.table}.{f.field}
                </button>
                {f.label && <span className="muted"> · {f.label.value}</span>}
              </li>
            ))}
            {data.fields.length === 0 && <li className="muted">No field found.</li>}
          </ul>
        )}
      </Card>
      {selected && <FieldDetails key={`${selected.table}.${selected.field}`} selected={selected} />}
      {selected && <FieldUsageCard field={selected.field} />}
    </>
  );
}

function FieldDetails({ selected }: { selected: Selected }) {
  const { client } = useSettings();
  const nav = useNav();
  const [field, setField] = useState<X3Field | null>(null);
  const [abbr, setAbbr] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    getTableCached(client, selected.table)
      .then((t) => {
        const f = t?.fields.find((x) => x.name.toUpperCase() === selected.field.toUpperCase()) ?? null;
        setField(f);
        setAbbr(t?.abbreviation?.value);
        if (!f) setError(`Field ${selected.field} not found in ${selected.table}`);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [client, selected]);

  return (
    <Card
      title={`${selected.table}.${selected.field}`}
      actions={
        <Button small onClick={() => nav.openTable(selected.table)}>
          Open table
        </Button>
      }
    >
      {error && <Message kind="warn">{error}</Message>}
      {field && (
        <>
          <div className="info">
            <InfoRow k="Label">
              <AttrValue attr={field.label} />
            </InfoRow>
            <InfoRow k="Columns">
              <span className="val">{field.columns.map((c) => c.name).join(', ')}</span>
            </InfoRow>
            <InfoRow k="X3 type">
              <AttrValue attr={field.x3Type} />
            </InfoRow>
            <InfoRow k="SQL type">
              <span className="val">
                {field.sqlType}
                {field.length !== null ? `(${field.length})` : ''}
              </span>
            </InfoRow>
            <InfoRow k="Local menu">
              <AttrValue attr={field.localMenu} missing="none / unknown" />
            </InfoRow>
            <InfoRow k="Linked table">
              <AttrValue attr={field.linkedTable} missing="none / unknown" />
            </InfoRow>
            <InfoRow k="Activity code">
              <AttrValue attr={field.activityCode} />
            </InfoRow>
            <InfoRow k="Key">
              <span className="val">{field.isKey ? 'Yes' : 'No'}</span>
            </InfoRow>
            <InfoRow k="Standard / Custom">
              <CustomBadge flag={field.custom} />
              <span className="src">{field.custom.reason}</span>
            </InfoRow>
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <CopyButton label="Field" value={field.name} />
            <CopyButton label="Column" value={field.columns[0]?.name ?? ''} />
            {abbr && <CopyButton label="[F:...]" value={tableFieldSyntax(abbr, field.name)} />}
          </div>
        </>
      )}
    </Card>
  );
}

function FieldUsageCard({ field }: { field: string }) {
  const { client } = useSettings();
  const nav = useNav();
  const [usage, setUsage] = useState<X3FieldUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      setUsage(await client.fieldUsage(field));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => setUsage(null), [field]);

  return (
    <Card
      title="Where is this field used?"
      actions={
        <Button small variant="primary" onClick={() => void load()} disabled={loading}>
          {loading ? <Spinner /> : usage ? 'Refresh' : `Find usages of ${field}`}
        </Button>
      }
    >
      {error && <Message kind="error">{error}</Message>}
      {usage && (
        <>
          <h3>Tables ({usage.tables.length})</h3>
          <ul className="list">
            {usage.tables.map((t) => (
              <li key={t.table}>
                <button type="button" className="link mono" onClick={() => nav.openTable(t.table)}>
                  {t.table}
                </button>
                <span className="muted small"> {t.columns.join(', ')}</span>
              </li>
            ))}
          </ul>
          <h3>Screens ({usage.screens.length})</h3>
          <ul className="list">
            {usage.screens.map((s, i) => (
              <li key={i} className="mono">
                {s.screen}
              </li>
            ))}
            {usage.screens.length === 0 && <li className="muted">None found.</li>}
          </ul>
          {usage.unavailable.length > 0 && (
            <Message kind="info">
              Not available:
              <ul>
                {usage.unavailable.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </Message>
          )}
        </>
      )}
    </Card>
  );
}
