import type { QueryResult, X3Field, X3Table } from '@x3i/shared';
import { buildSelectWhere, isNumericSqlType } from '@x3i/x3-core';
import { useState } from 'react';
import { QueryErrorBox } from '../../components/QueryErrorBox';
import { ExportBar, ResultGrid } from '../../components/ResultGrid';
import { Button, Collapsible, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { useSettings } from '../../state/SettingsContext';

/** "Query this value": SELECT * FROM <table> WHERE <column> = <value>, run in place. */
export function QueryValue({ table, field, value }: { table: X3Table; field: X3Field; value: string }) {
  const { client, dialect } = useSettings();
  const nav = useNav();
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const column = field.columns[0]?.name;
  if (!column) return null;
  const sql = buildSelectWhere(table.name, [{ column, value, numeric: isNumericSqlType(field.sqlType) }], dialect ?? 'mssql');
  const singleKey = table.primaryKey?.value.length === 1 && table.primaryKey.value[0]?.toUpperCase() === column.toUpperCase();

  const run = async () => {
    if (!client) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await client.query({ sql, maxRows: 50 }));
    } catch (e) {
      setResult(null);
      setError(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div className="btn-row">
        <Button variant="primary" onClick={() => void run()} disabled={running || !client || !value}>
          {running ? <Spinner /> : 'Query this value'}
        </Button>
        <Button onClick={() => nav.openSql(sql)}>Open in SQL</Button>
        <Button onClick={() => nav.openRecord(table.name, singleKey ? [{ column, value }] : undefined, singleKey)}>Open in Record Inspector</Button>
      </div>
      {field.dimension > 1 && <p className="small muted">Dimensioned field: the query uses {column} (first dimension).</p>}
      <pre className="code">{sql}</pre>
      {error !== null && <QueryErrorBox error={error} />}
      {result && (
        <>
          <p className="small muted">
            {result.rowCount} row(s) · {result.durationMs} ms{result.truncated ? ` · truncated at ${result.maxRows}` : ''}
          </p>
          <ResultGrid columns={result.columns.map((c) => c.name)} rows={result.rows} maxHeight={260} />
          <ExportBar columns={result.columns.map((c) => c.name)} rows={result.rows} baseName={table.name} />
          <Collapsible summary="Executed SQL">
            <pre className="code">{result.executedSql}</pre>
          </Collapsible>
        </>
      )}
    </div>
  );
}
