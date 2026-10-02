import type { RecordKeyPart, RecordResult, X3Relation, X3Table } from '@x3i/shared';
import { buildRelationQuery, isNumericSqlType, resolveInspectedField } from '@x3i/x3-core';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../../lib/companionClient';
import { getTableCached } from '../../../lib/metadataCache';
import { QueryErrorBox } from '../../components/QueryErrorBox';
import { TableAutocomplete } from '../../components/TableAutocomplete';
import { Button, Card, Collapsible, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { usePage } from '../../state/PageContext';
import { useSettings } from '../../state/SettingsContext';
import { RecordGrid } from './RecordGrid';
import { RelationList } from './RelationList';

export function RecordInspector() {
  const { client, dialect } = useSettings();
  const nav = useNav();
  const page = usePage();
  const [input, setInput] = useState('');
  const [table, setTable] = useState<X3Table | null>(null);
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [freeColumn, setFreeColumn] = useState('');
  const [result, setResult] = useState<RecordResult | null>(null);
  const [relations, setRelations] = useState<X3Relation[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const pendingRun = useRef(false);

  const keyCols = table?.primaryKey?.value ?? [];

  const loadTable = async (name: string, preset?: RecordKeyPart[]): Promise<X3Table | null> => {
    if (!client) return null;
    setError(null);
    setResult(null);
    setRelations(null);
    try {
      const t = await getTableCached(client, name);
      setTable(t);
      if (!t) {
        setError(new Error(`Table ${name} not found in the folder schema.`));
        return null;
      }
      setInput(t.name);
      const values: Record<string, string> = {};
      for (const p of preset ?? []) values[p.column.toUpperCase()] = String(p.value);
      setKeyValues(values);
      if (!t.primaryKey) setFreeColumn(preset?.[0]?.column ?? '');
      return t;
    } catch (e) {
      setError(e);
      return null;
    }
  };

  const keyParts = (t: X3Table | null, values: Record<string, string>): RecordKeyPart[] | null => {
    if (!t) return null;
    const cols = t.primaryKey?.value ?? (freeColumn ? [freeColumn] : []);
    if (cols.length === 0) return null;
    const parts = cols.map((c) => ({ column: c, value: values[c.toUpperCase()] ?? '' }));
    return parts.every((p) => p.value !== '') ? parts : null;
  };

  const run = async (t: X3Table | null = table, values = keyValues) => {
    const key = keyParts(t, values);
    if (!client || !t || !key) return;
    setLoading(true);
    setError(null);
    try {
      const r = await client.record({ table: t.name, key });
      setResult(r);
      client
        .getRelations(t.name)
        .then(setRelations)
        .catch(() => setRelations([]));
    } catch (e) {
      setResult(null);
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  // "open in Record Inspector" from another view
  useEffect(() => {
    const it = nav.recordIntent;
    if (!it) return;
    pendingRun.current = it.run;
    void loadTable(it.table, it.key).then((t) => {
      if (t && pendingRun.current) {
        const values: Record<string, string> = {};
        for (const p of it.key ?? []) values[p.column.toUpperCase()] = String(p.value);
        void run(t, values);
      }
      pendingRun.current = false;
    });
    // eslint-style exhaustive deps not wanted: react only to new intents
  }, [nav.recordIntent]);

  const inspectCurrent = async () => {
    const name = page.effective.mainTable.value;
    if (!name) {
      setError(new Error('Main table of the current screen is unknown (CURRENT > Screen).'));
      return;
    }
    const t = await loadTable(name);
    if (!t) return;
    const values: Record<string, string> = {};
    if (page.inspection) {
      const r = resolveInspectedField(page.inspection, t);
      const col = r.field?.columns[0]?.name;
      const v = page.inspection.displayedValue.value;
      if (r.field?.isKey && col && v) values[col.toUpperCase()] = v.trim();
    }
    setKeyValues(values);
    if (keyParts(t, values)) await run(t, values);
  };

  const isNumeric = (_t: string, column: string) => {
    const f = table?.fields.find((x) => x.columns.some((c) => c.name.toUpperCase() === column.toUpperCase()));
    return isNumericSqlType(f?.sqlType);
  };

  return (
    <>
      <Card
        title="Record Inspector"
        actions={
          <Button variant="primary" onClick={() => void inspectCurrent()}>
            Inspect Current Record
          </Button>
        }
      >
        <TableAutocomplete value={input} onChange={setInput} onSelect={(t) => void loadTable(t)} />
        {table && (
          <div className="form-grid" style={{ marginTop: 8 }}>
            {keyCols.length > 0 ? (
              keyCols.map((c) => (
                <KeyInput key={c} column={c} value={keyValues[c.toUpperCase()] ?? ''} onChange={(v) => setKeyValues((p) => ({ ...p, [c.toUpperCase()]: v }))} onEnter={() => void run()} />
              ))
            ) : (
              <>
                <label>Column</label>
                <select className="input" value={freeColumn} onChange={(e) => setFreeColumn(e.target.value)}>
                  <option value="">Choose a column (key unknown)</option>
                  {table.fields.flatMap((f) => f.columns).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {freeColumn && <KeyInput column={freeColumn} value={keyValues[freeColumn.toUpperCase()] ?? ''} onChange={(v) => setKeyValues((p) => ({ ...p, [freeColumn.toUpperCase()]: v }))} onEnter={() => void run()} />}
              </>
            )}
          </div>
        )}
        {table && !table.primaryKey && <p className="small muted">Primary key unknown: the record is searched on the chosen column.</p>}
        {table?.primaryKey && (
          <p className="small muted">
            Key {table.primaryKey.value.join(' + ')} · {table.primaryKey.prov.confidence} · {table.primaryKey.prov.detail}
          </p>
        )}
        <div className="btn-row" style={{ marginTop: 6 }}>
          <Button variant="primary" disabled={!keyParts(table, keyValues) || loading} onClick={() => void run()}>
            {loading ? <Spinner /> : 'Load record'}
          </Button>
        </div>
        {error !== null && <div style={{ marginTop: 6 }}>{error instanceof Error && !('code' in error) ? <Message kind="error">{errorMessage(error)}</Message> : <QueryErrorBox error={error} />}</div>}
      </Card>

      {result && (
        <Card title={`${result.table.name} record`}>
          {result.matches === 0 && <Message kind="warn">No record found for this key.</Message>}
          {result.matches > 1 && <Message kind="warn">Several records match this key: it is not unique. The first one is shown.</Message>}
          {result.row && <RecordGrid table={result.table} row={result.row} />}
          <Collapsible summary="Executed SQL">
            <pre className="code">{result.executedSql}</pre>
            <span className="small muted">{result.durationMs} ms</span>
          </Collapsible>
        </Card>
      )}

      {result?.row && (
        <Card title="Related data">
          {!relations && <Spinner />}
          {relations && (
            <RelationList
              relations={relations}
              onOpenTable={(t) => nav.openTable(t)}
              onQuery={(r) => {
                const sql = result.row ? buildRelationQuery(r, result.row, dialect ?? 'mssql', isNumeric) : null;
                if (sql) nav.openSql(sql, true);
              }}
            />
          )}
        </Card>
      )}
    </>
  );
}

function KeyInput({ column, value, onChange, onEnter }: { column: string; value: string; onChange: (v: string) => void; onEnter: () => void }) {
  return (
    <>
      <label className="mono">{column}</label>
      <input className="input mono" value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter()} />
    </>
  );
}
