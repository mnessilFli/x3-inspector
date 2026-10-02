import {
  baseX3Field,
  buildReadQuery,
  nodeCandidatesForKeyField,
  readResult,
  recordRows,
  type GqlNode,
  type NodeCandidate,
  type RecordRow,
} from '@x3i/x3-core';
import { useEffect, useState } from 'react';
import { getSchemaIndex, schemaScope } from '../../../lib/gqlSchemaIndex';
import { runGraphqlInActiveTab } from '../../../lib/sessionGraphql';
import { Button, Card, CopyButton, Message, Spinner } from '../../components/ui';
import { usePage } from '../../state/PageContext';
import { GqlRecordGrid } from './GqlRecordGrid';

const MAX_TRIES = 5;

interface Result {
  node: GqlNode;
  query: string;
  rows: RecordRow[];
}

/**
 * Current record through GraphQL with the user's X3 session (X3 Cloud: no SQL).
 * The key field clicked in X3 (e.g. BPCNUM) is mapped to GraphQL nodes whose property description
 * carries that X3 field; candidates are tried with read(_id) until one answers.
 */
export function GraphqlRecordView() {
  const page = usePage();
  const { inspection, context } = page;
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [candidates, setCandidates] = useState<NodeCandidate[]>([]);
  const [tried, setTried] = useState<string[]>([]);

  // prefill from the last field identified by Syracuse
  useEffect(() => {
    const f = inspection?.syracuse?.field;
    if (!f) return;
    setField(f);
    setValue(inspection?.displayedValue.value ?? '');
  }, [inspection?.id]);

  const scope = schemaScope(context?.url, context?.dataset.value);

  const readWith = async (list: NodeCandidate[]) => {
    const log: string[] = [];
    for (const c of list) {
      const query = buildReadQuery(c.node, value.trim());
      setBusy(`Reading ${c.node.pkg}.${c.node.node}...`);
      const r = await runGraphqlInActiveTab(query);
      const rec = r.ok || r.body ? readResult(c.node, r.body) : null;
      if (rec) {
        setResult({ node: c.node, query, rows: recordRows(c.node, rec) });
        setTried(log);
        return true;
      }
      const errs = (r.body as { errors?: Array<{ message?: string }> } | undefined)?.errors;
      log.push(`${c.node.pkg}.${c.node.node}: ${errs?.[0]?.message ?? r.error ?? 'no record'}`);
    }
    setTried(log);
    return false;
  };

  const read = async () => {
    setError(null);
    setResult(null);
    setTried([]);
    if (!scope) return setError('Open a Sage X3 page first (CURRENT > Screen > Inspect current X3 screen).');
    try {
      setBusy('Loading the GraphQL schema (first time only, about 20 s)...');
      const index = await getSchemaIndex(scope);
      const list = nodeCandidatesForKeyField(index, field.trim().toUpperCase());
      setCandidates(list);
      if (list.length === 0) {
        setError(`No GraphQL property declares the X3 field ${baseX3Field(field.trim().toUpperCase())} in its description.`);
        return;
      }
      if (!(await readWith(list.slice(0, MAX_TRIES)))) setError(`No GraphQL object returned a record for ${value.trim()} (tried ${Math.min(MAX_TRIES, list.length)}).`);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const readCandidate = async (c: NodeCandidate) => {
    setError(null);
    setResult(null);
    if (!(await readWith([c]))) setError(`${c.node.pkg}.${c.node.node} returned no record for ${value.trim()}.`);
    setBusy(null);
  };

  const highlight = field ? baseX3Field(field.trim().toUpperCase()) : null;

  return (
    <>
      <Card
        title="Current record (GraphQL)"
        actions={
          <Button variant="primary" onClick={() => void read()} disabled={busy !== null || !field.trim() || !value.trim()}>
            {busy ? <Spinner /> : 'Read record'}
          </Button>
        }
      >
        <p className="small muted">
          Read only, with your X3 session. Click the key field in X3 (e.g. the customer code): the X3 field and its value are filled in here.
        </p>
        <div className="info">
          <div className="k">X3 key field</div>
          <div className="v">
            <input className="input mono" value={field} onChange={(e) => setField(e.target.value)} placeholder="BPCNUM" />
          </div>
          <div className="k">Value</div>
          <div className="v">
            <input className="input mono" value={value} onChange={(e) => setValue(e.target.value)} placeholder="T107758" />
          </div>
        </div>
        {busy && <p className="small muted">{busy}</p>}
        {error && <Message kind="warn">{error}</Message>}
        {tried.length > 0 && (
          <ul className="list small muted">
            {tried.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {candidates.length > 1 && (
          <div className="small" style={{ marginTop: 6 }}>
            Other GraphQL objects carrying {highlight}:{' '}
            {candidates.slice(0, 12).map((c) => (
              <button key={`${c.node.pkg}.${c.node.node}`} type="button" className="link mono" style={{ marginRight: 8 }} onClick={() => void readCandidate(c)}>
                {c.node.node}.{c.prop.name}
              </button>
            ))}
          </div>
        )}
      </Card>
      {result && (
        <Card title={`${result.node.pkg}.${result.node.node} · ${value.trim()}`}>
          <p className="small muted">
            Object chosen because its property carries {highlight} (schema description): verify it is the expected record.
          </p>
          <GqlRecordGrid rows={result.rows} highlight={highlight} name={`${result.node.node}-${value.trim()}`} />
          <div className="btn-row" style={{ marginTop: 6 }}>
            <CopyButton label="Copy GraphQL query" value={result.query} />
          </div>
        </Card>
      )}
    </>
  );
}
