import type { CellValue } from '@x3i/shared';
import { CONNECTOR_SQL, detectIndexNode, detectLogNode, indexQuery, logQuery, parseX3ql, x3qlRows, type X3qlQuery } from '@x3i/x3-core';
import { useMemo, useState } from 'react';
import { runGraphqlInActiveTab } from '../../../lib/sessionGraphql';
import { ResultGrid } from '../../components/ResultGrid';
import { Button, Card, CopyButton, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { useSettings } from '../../state/SettingsContext';
import { useSchemaIndex } from '../../state/useSchemaIndex';
import { SchemaLoader } from '../query/SchemaLoader';

interface Result {
  query: X3qlQuery;
  rows: Array<Record<string, CellValue>>;
}

/**
 * YINDEXAPI and Log API (YLAPI). On X3 Cloud they are read through GraphQL once published (see
 * docs/guide-graphql-connecteur.md); the nodes are recognized from their X3 field codes, whatever
 * their names. On-premise, the same searches run in SQL through the Companion.
 */
export function LogsIndexView() {
  const nav = useNav();
  const { client } = useSettings();
  const { index, loading, error, load } = useSchemaIndex();
  const idxNode = useMemo(() => (index ? detectIndexNode(index) : null), [index]);
  const logNode = useMemo(() => (index ? detectLogNode(index) : null), [index]);
  const [sfId, setSfId] = useState('');
  const [x3Key, setX3Key] = useState('');
  const [table, setTable] = useState('');
  const [flow, setFlow] = useState('');
  const [ws, setWs] = useState('');
  const [key1, setKey1] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async (x3ql: string) => {
    if (!index) return;
    const p = parseX3ql(x3ql, index);
    setErr(null);
    setResult(null);
    if (!p.ok) return setErr(p.errors.map((e) => e.message).join(' · '));
    setBusy(true);
    const r = await runGraphqlInActiveTab(p.query.graphql);
    setBusy(false);
    const rows = x3qlRows(p.query, r.body);
    if (!rows) return setErr((r.body as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ?? r.error ?? 'No data');
    setResult({ query: p.query, rows: rows.rows });
  };

  const input = (value: string, set: (v: string) => void, placeholder: string) => <input className="input mono" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />;

  return (
    <>
      <SchemaLoader index={index} loading={loading} error={error} onLoad={(r) => void load(r)} />
      <Card title="Index YINDEXAPI (Salesforce id ↔ X3 key)">
        {idxNode ? (
          <>
            <p className="small muted">GraphQL object {idxNode.node.pkg}.{idxNode.node.node} (recognized from NUMIDD and CLE).</p>
            <div className="info">
              <div className="k">Salesforce id (NUMIDD)</div>
              <div className="v">{input(sfId, setSfId, '001...')}</div>
              <div className="k">X3 key (CLE, starts with)</div>
              <div className="v">{input(x3Key, setX3Key, 'T107758')}</div>
              <div className="k">Table (CODFIC)</div>
              <div className="v">{input(table, setTable, 'BPCUSTOMER')}</div>
            </div>
            <Button variant="primary" disabled={busy} onClick={() => void run(indexQuery(idxNode, { salesforceId: sfId, x3Key, table }))}>
              {busy ? <Spinner /> : 'Search the index'}
            </Button>
          </>
        ) : (
          <>
            <Message kind="info">Not published in GraphQL on this X3 yet (guide docs/guide-graphql-connecteur.md). Use the SQL query tool below meanwhile.</Message>
            <div className="info">
              <div className="k">Salesforce id (NUMIDD)</div>
              <div className="v">{input(sfId, setSfId, '001...')}</div>
              <div className="k">X3 key (CLE, starts with)</div>
              <div className="v">{input(x3Key, setX3Key, 'T107758')}</div>
            </div>
          </>
        )}
      </Card>
      <Card title="Log API (YLAPI)">
        {logNode ? (
          <>
            <p className="small muted">GraphQL object {logNode.node.pkg}.{logNode.node.node} (recognized from YCOMPT and YNAMWS). Newest first.</p>
            <div className="info">
              <div className="k">Flow (YFLUX)</div>
              <div className="v">{input(flow, setFlow, 'flow code')}</div>
              <div className="k">Web service (YNAMWS)</div>
              <div className="v">{input(ws, setWs, 'YWWS...')}</div>
              <div className="k">Key 1 (YCLEF1, starts with)</div>
              <div className="v">{input(key1, setKey1, 'T107758')}</div>
            </div>
            <Button variant="primary" disabled={busy} onClick={() => void run(logQuery(logNode, { flow, webService: ws, key1 }))}>
              {busy ? <Spinner /> : 'Last log lines'}
            </Button>
          </>
        ) : (
          <Message kind="info">Not published in GraphQL on this X3 yet (same guide).</Message>
        )}
      </Card>
      {err && <Message kind="warn">{err}</Message>}
      {result && (
        <Card title={`${result.rows.length} line(s)`}>
          <ResultGrid columns={result.query.columns.map((c) => c.name)} rows={result.rows} maxHeight={420} />
        </Card>
      )}
      <Card title="Without GraphQL: SQL for the X3 SQL query tool (GESALQ)">
        <p className="small muted">
          Works today, no deployment: copy a query, then in X3 open the SQL query tool (function GESALQ, Sage help "Requeteur SQL"), paste it in the Parametrage tab, Validate then
          Execute. Fill the Salesforce id or X3 key above first. The last query uses TOP (SQL Server syntax).
        </p>
        <div className="btn-row">
          <CopyButton label="Index by Salesforce id" value={sfId.trim() ? CONNECTOR_SQL.indexBySalesforceId(sfId.trim()) : ''} />
          <CopyButton label="Index by X3 key" value={x3Key.trim() ? CONNECTOR_SQL.indexByX3Key(x3Key.trim()) : ''} />
          <CopyButton label="Last 100 log lines" value={CONNECTOR_SQL.lastLogs()} />
        </div>
        {client?.hasToken && (
          <div className="btn-row" style={{ marginTop: 6 }}>
            <Button small disabled={!sfId.trim()} onClick={() => nav.openSql(CONNECTOR_SQL.indexBySalesforceId(sfId.trim()), true)}>
              Run in SQL tab (Companion): by Salesforce id
            </Button>
            <Button small onClick={() => nav.openSql(CONNECTOR_SQL.lastLogs(), true)}>
              Run in SQL tab: last logs
            </Button>
          </div>
        )}
      </Card>
      <Card title="Reading the Log API and the index (connector rules)">
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Nothing is logged if YWSTYPLOG is neither 1 nor 2 (CONNECTOR &gt; Parameters shows its value).</li>
          <li>Incoming: YCAPI_LOG = No logs everything; Yes + level 1 does not log successes; level 2 logs everything. Changing the level requires Save then Complete generation.</li>
          <li>Outgoing: YCAPI_LOG = No logs nothing; only level 2 logs successes. The log holds the RESPONSE body; the body sent is in &lt;YLARCHAPI&gt;\&lt;flow&gt;.txt.</li>
          <li>Incoming line with an empty key: the import did not create or modify anything.</li>
          <li>YINDEXAPI key format: key1~key2~key3 (CLE); only the first 3 key values are used to find the Salesforce id (NUMIDD).</li>
          <li>YSTA uses local menu 1054 and YTYPFLUX local menu 5055: their labels are not delivered in the connector sources.</li>
        </ul>
        <p className="small muted">Sources: skill connecteur-dhm-fli; YINDEXAPI / YLAPI columns from the PREPROD table dictionary (2026-10-02).</p>
      </Card>
    </>
  );
}
