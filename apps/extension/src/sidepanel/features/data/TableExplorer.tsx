import type { X3Relation, X3Table } from '@x3i/shared';
import { buildTopRows } from '@x3i/x3-core';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../../lib/companionClient';
import { getTableCached } from '../../../lib/metadataCache';
import { TableAutocomplete } from '../../components/TableAutocomplete';
import { Button, Card, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { useSettings } from '../../state/SettingsContext';
import { FieldsGrid } from './FieldsGrid';
import { RelationList } from './RelationList';
import { TableSummaryInfo } from './TableSummaryInfo';

export function TableExplorer() {
  const { client, dialect } = useSettings();
  const nav = useNav();
  const [input, setInput] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [table, setTable] = useState<X3Table | null>(null);
  const [relations, setRelations] = useState<X3Relation[] | null>(null);
  const [relError, setRelError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (nav.tableIntent) {
      setInput(nav.tableIntent.table);
      setName(nav.tableIntent.table);
    }
  }, [nav.tableIntent]);

  useEffect(() => {
    setTable(null);
    setRelations(null);
    setError(null);
    setRelError(null);
    if (!name || !client) return;
    let cancelled = false;
    setLoading(true);
    getTableCached(client, name)
      .then((t) => {
        if (cancelled) return;
        if (!t) setError(`Table ${name} not found in the folder schema.`);
        setTable(t);
        if (t) {
          client
            .getRelations(t.name)
            .then((r) => !cancelled && setRelations(r))
            .catch((e: unknown) => !cancelled && setRelError(errorMessage(e)));
        }
      })
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [name, client]);

  return (
    <>
      <Card title="Table Explorer">
        <TableAutocomplete value={input} onChange={setInput} onSelect={(t) => setName(t)} />
        {!client && <p className="small muted">Configure an environment first (TOOLS &gt; Settings).</p>}
        {loading && <Spinner />}
        {error && <Message kind="error">{error}</Message>}
      </Card>
      {table && (
        <>
          <Card
            title={table.name}
            actions={
              <div className="btn-row">
                <Button small onClick={() => nav.openSql(buildTopRows(table.name, 100, dialect ?? 'mssql'), true)}>
                  Query top 100
                </Button>
                <Button small onClick={() => nav.openRecord(table.name)}>
                  Record Inspector
                </Button>
              </div>
            }
          >
            <TableSummaryInfo table={table} />
          </Card>
          <Card title={`Fields (${table.fields.length})`}>
            <FieldsGrid fields={table.fields} onField={(f) => nav.openField(f.name, table.name)} />
          </Card>
          <Card title={`Keys / indexes (${table.indexes.length})`}>
            <ul className="list">
              {table.indexes.map((i) => (
                <li key={i.name}>
                  <span className="mono">{i.primary ? '🔑 ' : ''}{i.name}</span>
                  {i.code && <span className="muted"> · code {i.code.value}</span>}
                  {i.unique && <span className="badge METADATA">UNIQUE</span>}
                  <span className="src mono">{i.columns.join(', ')}</span>
                </li>
              ))}
              {table.indexes.length === 0 && <li className="muted">No index in the SQL catalog.</li>}
            </ul>
          </Card>
          <Card title="Relations">
            {relError && <Message kind="error">{relError}</Message>}
            {!relations && !relError && <Spinner />}
            {relations && <RelationList relations={relations} onOpenTable={(t) => { setInput(t); setName(t); }} />}
          </Card>
        </>
      )}
    </>
  );
}
