import type { QueryResult } from '@x3i/shared';
import { validateReadOnly } from '@x3i/x3-core';
import { useEffect, useMemo, useState } from 'react';
import { format } from 'sql-formatter';
import { pushHistory } from '../../../lib/storage';
import { QueryErrorBox } from '../../components/QueryErrorBox';
import { ExportBar, ResultGrid } from '../../components/ResultGrid';
import { Button, Card, Collapsible, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { useSettings } from '../../state/SettingsContext';
import { SavedQueries } from './SavedQueries';
import { SqlEditor } from './SqlEditor';

export function SqlView() {
  const { client, dialect, status, settings, activeEnv } = useSettings();
  const nav = useNav();
  const [sql, setSql] = useState('');
  const [maxRows, setMaxRows] = useState(settings.defaultMaxRows);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [formatError, setFormatError] = useState<string | null>(null);

  const limit = status?.maxRowsLimit ?? 5000;
  useEffect(() => setMaxRows(Math.min(settings.defaultMaxRows, limit)), [settings.defaultMaxRows, limit]);

  const validation = useMemo(() => (sql.trim() ? validateReadOnly(sql, { dialect: dialect ?? 'any' }) : null), [sql, dialect]);

  const run = async (text = sql) => {
    if (!client || !text.trim()) return;
    const v = validateReadOnly(text, { dialect: dialect ?? 'any' });
    if (!v.ok) return;
    setRunning(true);
    setError(null);
    try {
      const r = await client.query({ sql: text, maxRows: Math.max(1, Math.min(maxRows, limit)) });
      setResult(r);
      await pushHistory({ sql: text, envId: activeEnv?.id ?? null, at: new Date().toISOString(), rowCount: r.rowCount });
      setHistoryVersion((n) => n + 1);
    } catch (e) {
      setResult(null);
      setError(e);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    const it = nav.sqlIntent;
    if (!it) return;
    setSql(it.sql);
    if (it.run) void run(it.sql);
    // react to new intents only
  }, [nav.sqlIntent]);

  const doFormat = () => {
    try {
      setSql(format(sql, { language: dialect === 'oracle' ? 'plsql' : 'transactsql', keywordCase: 'upper', tabWidth: 2 }));
      setFormatError(null);
    } catch (e) {
      setFormatError((e as Error).message);
    }
  };

  const columns = result?.columns.map((c) => c.name) ?? [];

  return (
    <>
      <Card title="SQL query">
        <SqlEditor value={sql} onChange={setSql} onRun={() => void run()} deps={{ client, dialect: dialect ?? 'mssql' }} dbDialect={dialect} />
        {validation && !validation.ok && (
          <div style={{ marginTop: 6 }}>
            <Message kind="error">
              Not allowed in read-only mode:
              <ul>
                {validation.errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </Message>
          </div>
        )}
        {formatError && <Message kind="warn">Format failed: {formatError}</Message>}
        <div className="btn-row" style={{ marginTop: 8 }}>
          <Button variant="primary" disabled={!client || running || !validation?.ok} onClick={() => void run()} title="Ctrl+Enter">
            {running ? <Spinner /> : 'Run'}
          </Button>
          <Button onClick={doFormat} disabled={!sql.trim()}>
            Format
          </Button>
          <Button onClick={() => setSql('')}>Clear</Button>
          <label className="checkbox">
            Max rows
            <input
              className="input"
              style={{ width: 72 }}
              type="number"
              min={1}
              max={limit}
              value={maxRows}
              onChange={(e) => setMaxRows(Math.max(1, Math.min(Number(e.target.value) || 1, limit)))}
            />
          </label>
        </div>
        <p className="small muted">
          Read only · tables are qualified with the folder schema by the companion
          {dialect ? ` · ${dialect === 'mssql' ? 'SQL Server' : 'Oracle'}` : ' · database type unknown, validated for both dialects'} · limit {limit} rows
        </p>
        <SavedQueries sql={sql} envId={activeEnv?.id ?? null} historyVersion={historyVersion} onPick={setSql} />
      </Card>

      {(result || error !== null) && (
        <Card title="Result">
          {error !== null && <QueryErrorBox error={error} />}
          {result && (
            <>
              <p className="small muted">
                {result.rowCount} row(s) · {result.durationMs} ms
              </p>
              {result.truncated && <Message kind="warn">Result truncated at {result.maxRows} rows (read-only row limit).</Message>}
              {result.warnings.map((w) => (
                <Message key={w} kind="info">
                  {w}
                </Message>
              ))}
              <ExportBar columns={columns} rows={result.rows} baseName="query" />
              <div style={{ marginTop: 6 }}>
                <ResultGrid columns={columns} rows={result.rows} />
              </div>
              <Collapsible summary="Executed SQL">
                <pre className="code">{result.executedSql}</pre>
              </Collapsible>
            </>
          )}
        </Card>
      )}
    </>
  );
}
