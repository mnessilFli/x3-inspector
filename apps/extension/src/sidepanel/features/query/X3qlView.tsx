import type { CellValue } from '@x3i/shared';
import { nodeCandidatesForKeyField, parseX3ql, x3qlRows, x3qlSuggestions, type X3qlQuery } from '@x3i/x3-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { runGraphqlInActiveTab } from '../../../lib/sessionGraphql';
import { ResultGrid } from '../../components/ResultGrid';
import { Button, Card, Collapsible, CopyButton, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { usePage } from '../../state/PageContext';
import { useSchemaIndex } from '../../state/useSchemaIndex';
import { SchemaLoader } from './SchemaLoader';
import { X3qlEditor, type EditorApi } from './X3qlEditor';
import { useX3qlHistory } from './useX3qlHistory';

const MAX_CHIPS = 80;

interface Result {
  query: X3qlQuery;
  rows: Array<Record<string, CellValue>>;
  totalCount: number | null;
  durationMs: number;
}

const TEMPLATES: Array<{ label: string; query: string }> = [
  { label: 'Customers', query: 'SELECT code, companyName1, shortCompanyName, isActive, customerCategory FROM customer LIMIT 20' },
  { label: 'Sales orders of a customer', query: "SELECT id, soldToCustomer, orderDate FROM salesOrder WHERE soldToCustomer._id = 'T107758' LIMIT 20" },
  { label: 'Customers by name', query: "SELECT code, companyName1 FROM customer WHERE companyName1 LIKE 'KAO%' LIMIT 20" },
];

/**
 * Salesforce Inspector "Data Export" for X3 Cloud: SOQL-like text translated to GraphQL, run with
 * the user's X3 session, read only. Suggestions appear as chips under the editor.
 */
export function X3qlView() {
  const { index, loading, error: indexError, load } = useSchemaIndex();
  const { inspection } = usePage();
  const nav = useNav();
  const [text, setText] = useState('');
  const [cursor, setCursor] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const api = useRef<EditorApi | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  const history = useX3qlHistory();

  const parsed = useMemo(() => (index && text.trim() ? parseX3ql(text, index) : null), [index, text]);
  const sugg = useMemo(() => (index ? x3qlSuggestions(text, cursor, index) : null), [index, text, cursor]);
  const templates = useMemo(() => {
    const list = index ? TEMPLATES.filter((t) => parseX3ql(t.query, index).ok) : [];
    const f = inspection?.syracuse?.field;
    const v = inspection?.displayedValue.value;
    const c = index && f && v ? nodeCandidatesForKeyField(index, f)[0] : undefined;
    if (c && v && inspection?.syracuse?.isKey) list.unshift({ label: `Current record (${c.node.node} ${v})`, query: `SELECT * FROM ${c.node.node} WHERE _id = '${v.replace(/'/g, "''")}' LIMIT 1` });
    return list;
  }, [index, inspection?.id]);

  const run = async (q = text) => {
    if (!index) return;
    const p = parseX3ql(q, index);
    setRunError(null);
    if (!p.ok) {
      setRunError(p.errors.map((e) => e.message).join(' · '));
      return;
    }
    setBusy(true);
    const r = await runGraphqlInActiveTab(p.query.graphql);
    setBusy(false);
    const errs = (r.body as { errors?: Array<{ message?: string }> } | undefined)?.errors;
    const rows = x3qlRows(p.query, r.body);
    if (!rows) {
      setResult(null);
      setRunError(errs?.map((e) => e.message).join(' · ') ?? r.error ?? 'No data in the answer');
      return;
    }
    if (errs?.length) setRunError(`Partial answer: ${errs.map((e) => e.message).join(' · ')}`);
    setResult({ query: p.query, rows: rows.rows, totalCount: rows.totalCount, durationMs: r.durationMs });
    void history.push(q);
  };

  useEffect(() => {
    const i = nav.x3qlIntent;
    if (!i) return;
    setText(i.query);
    if (i.run && indexRef.current) void run(i.query);
  }, [nav.x3qlIntent?.nonce]);

  const insert = (value: string) => {
    if (!sugg || !api.current) return;
    const inSelectList = sugg.kind === 'fields' && /\bFROM\b/i.test(text.slice(sugg.to));
    api.current.replace(sugg.from, sugg.to, inSelectList && !/^\s*,/.test(text.slice(sugg.to)) ? `${value}, ` : value);
  };
  const insertAll = () => {
    if (!sugg || sugg.kind !== 'fields' || !api.current) return;
    const present = new Set((text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((w) => w.toLowerCase()));
    const names = sugg.items.map((i) => i.insert).filter((n) => !present.has(n.toLowerCase()));
    if (names.length) api.current.replace(sugg.from, sugg.to, names.join(', '));
  };

  return (
    <>
      <SchemaLoader index={index} loading={loading} error={indexError} onLoad={(refresh) => void load(refresh)} />
      <Card
        title="Data Export (GraphQL)"
        actions={
          <Button variant="primary" onClick={() => void run()} disabled={!index || busy || !text.trim()} title="Run the query (Ctrl+Enter)">
            {busy ? <Spinner /> : 'Run Export'}
          </Button>
        }
      >
        <div className="btn-row" style={{ marginBottom: 6 }}>
          <select className="input" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && setText(e.target.value)} title="Ready-made queries, validated on this X3 schema">
            <option value="">Templates</option>
            {templates.map((t) => (
              <option key={t.label} value={t.query}>
                {t.label}
              </option>
            ))}
          </select>
          <select className="input" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && setText(e.target.value)} title="Last queries run">
            <option value="">Query History ({history.items.length})</option>
            {history.items.map((h) => (
              <option key={h} value={h}>
                {h.length > 70 ? `${h.slice(0, 70)}...` : h}
              </option>
            ))}
          </select>
          <Button small onClick={() => setText('')} title="Empty the editor">
            Clear
          </Button>
        </div>
        <X3qlEditor
          value={text}
          onChange={(v, c) => {
            setText(v);
            setCursor(c);
          }}
          onCursor={setCursor}
          onRun={() => void run()}
          onInsertAll={insertAll}
          getIndex={() => indexRef.current}
          onReady={(a) => (api.current = a)}
        />
        <p className="small muted" style={{ margin: '4px 0' }}>
          <b>Ctrl+Enter</b> run · <b>Ctrl+Space</b> insert all suggested fields · click a suggestion to insert it · hover a word for its meaning · syntax: SELECT, FROM, WHERE (=, &gt;=, &lt;=, LIKE, AND), ORDER BY, LIMIT · reference fields: <code>customerCategory._id</code>
        </p>
        {parsed && !parsed.ok && text.trim().length > 12 && <p className="small" style={{ color: '#ba0517', margin: '2px 0' }}>{parsed.errors[0]?.message}</p>}
        {sugg && sugg.keywords.length > 0 && (
          <div className="chips" style={{ marginTop: 6 }}>
            {sugg.keywords.map((k) => (
              <button key={k.label} type="button" className="chip kw" title={k.detail} onClick={() => api.current?.replace(sugg.from, sugg.to, `${k.insert} `)}>
                {k.label}
              </button>
            ))}
          </div>
        )}
        {sugg && sugg.kind !== 'none' && sugg.items.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div className="small muted">
              {sugg.kind === 'objects' ? 'Objects suggestions' : `Fields suggestions${sugg.node ? ` (${sugg.node.node})` : ''}`}: {sugg.items.length}
            </div>
            <div className="chips">
              {sugg.items.slice(0, MAX_CHIPS).map((i) => (
                <button key={i.insert} type="button" className="chip" title={i.detail} onClick={() => insert(i.insert)}>
                  {i.label}
                  {i.detail.startsWith('X3: ') && <span className="chip-code">{i.detail.slice(4).split(' ')[0]}</span>}
                </button>
              ))}
              {sugg.items.length > MAX_CHIPS && <span className="small muted">+{sugg.items.length - MAX_CHIPS}: keep typing to filter</span>}
            </div>
          </div>
        )}
      </Card>
      {runError && <Message kind="warn">{runError}</Message>}
      {result && (
        <Card title={`Export Result · ${result.rows.length}${result.totalCount !== null ? ` of ${result.totalCount}` : ''} rows · ${result.durationMs} ms`}>
          <ResultGrid columns={result.query.columns.map((c) => c.name)} rows={result.rows} maxHeight={420} />
          <Collapsible summary="Generated GraphQL">
            <pre className="code">{result.query.graphql}</pre>
            <CopyButton label="Copy GraphQL" value={result.query.graphql} />
          </Collapsible>
        </Card>
      )}
    </>
  );
}
