import { INTROSPECTION_QUERY, validateGraphqlReadOnly } from '@x3i/x3-core';
import { useState } from 'react';
import { downloadText } from '../../../lib/clipboard';
import type { GraphqlResponse } from '../../../lib/messages';
import { runGraphqlInActiveTab } from '../../../lib/sessionGraphql';
import { Button, Card, CopyButton, Message, Spinner } from '../../components/ui';

const SAMPLE = '{ __schema { queryType { fields { name } } } }';

/** GraphQL through the user's X3 session (same calls as the Syracuse GraphiQL explorer), read-only. */
export function GraphqlView() {
  const [query, setQuery] = useState(SAMPLE);
  const [busy, setBusy] = useState<'run' | 'schema' | null>(null);
  const [result, setResult] = useState<GraphqlResponse | null>(null);
  const [schemaInfo, setSchemaInfo] = useState<string | null>(null);
  const validation = validateGraphqlReadOnly(query);
  const resultText = result ? (typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)) : '';

  const run = async () => {
    setBusy('run');
    setResult(await runGraphqlInActiveTab(query));
    setBusy(null);
  };

  const exportSchema = async () => {
    setBusy('schema');
    setSchemaInfo(null);
    const r = await runGraphqlInActiveTab(INTROSPECTION_QUERY);
    setBusy(null);
    if (!r.ok) {
      setResult(r);
      return;
    }
    const json = JSON.stringify(r.body);
    downloadText('x3-graphql-schema.json', json, 'application/json');
    const types = (r.body as { data?: { __schema?: { types?: unknown[] } } }).data?.__schema?.types?.length ?? 0;
    setSchemaInfo(`${types} types, ${(json.length / 1024 / 1024).toFixed(1)} MB, ${r.durationMs} ms`);
  };

  return (
    <>
      <Card
        title="GraphQL (X3 session)"
        actions={
          <Button variant="primary" onClick={() => void exportSchema()} disabled={busy !== null}>
            {busy === 'schema' ? <Spinner /> : 'Export full schema'}
          </Button>
        }
      >
        <p className="small muted">
          Runs on the active X3 tab with your current session, like the Syracuse GraphiQL explorer (POST /xtrem/explorer/). Read only: mutations are blocked.
        </p>
        {schemaInfo && <Message kind="ok">Schema downloaded (x3-graphql-schema.json): {schemaInfo}</Message>}
        <textarea className="mono" rows={8} style={{ width: '100%', boxSizing: 'border-box' }} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
        {!validation.ok && <Message kind="error">{validation.errors.map((e) => e.message).join('; ')}</Message>}
        <div className="btn-row" style={{ marginTop: 8 }}>
          <Button variant="primary" onClick={() => void run()} disabled={busy !== null || !validation.ok}>
            {busy === 'run' ? <Spinner /> : 'Run'}
          </Button>
          <CopyButton label="Copy result" value={resultText} disabled={!result} />
        </div>
      </Card>
      {result && (
        <Card title={`Result · HTTP ${result.status || '-'} · ${result.durationMs} ms`}>
          {result.error && <Message kind="error">{result.error}</Message>}
          <pre className="code" style={{ maxHeight: 400, overflow: 'auto' }}>
            {resultText.length > 200000 ? `${resultText.slice(0, 200000)}\n... (truncated, use Copy result)` : resultText}
          </pre>
        </Card>
      )}
    </>
  );
}
