import { connectorParam, CONNECTOR_PARAMS, CONNECTOR_USER_PARAMS, looksSecret, parseX3ql, x3qlRows } from '@x3i/x3-core';
import { useMemo, useState } from 'react';
import { runGraphqlInActiveTab } from '../../../lib/sessionGraphql';
import { Button, Card, Message, Spinner } from '../../components/ui';
import { useSchemaIndex } from '../../state/useSchemaIndex';
import { SchemaLoader } from '../query/SchemaLoader';

const Q_DEF = "SELECT code, description, valueType, localMenu, definitionLevel, folderValue FROM generalParameter WHERE code LIKE 'Y%' LIMIT 1000";
const Q_VAL = "SELECT code, company, siteOrLegislationCode, value FROM generalParametersData WHERE code LIKE 'Y%' LIMIT 1000";
const Q_USR = "SELECT description, user, value FROM userParameterValue WHERE description = 'YMODTEST' LIMIT 500";

type Row = Record<string, string | number | boolean | null>;

/** Connector parameters (general + user) read with GraphQL, with what the connector code does with each. */
export function ParamsView() {
  const { index, loading, error, load } = useSchemaIndex();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [defs, setDefs] = useState<Row[] | null>(null);
  const [vals, setVals] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [onlyConnector, setOnlyConnector] = useState(true);

  const run = async (q: string): Promise<Row[]> => {
    if (!index) throw new Error('X3 objects not loaded');
    const p = parseX3ql(q, index);
    if (!p.ok) throw new Error(p.errors.map((e) => e.message).join(' · '));
    const r = await runGraphqlInActiveTab(p.query.graphql);
    const rows = x3qlRows(p.query, r.body);
    if (!rows) throw new Error(r.error ?? (r.body as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ?? 'no data');
    return rows.rows;
  };

  const refresh = async () => {
    setBusy(true);
    setErr(null);
    try {
      const [d, v, u] = await Promise.all([run(Q_DEF), run(Q_VAL), run(Q_USR).catch(() => [])]);
      setDefs(d);
      setVals(v);
      setUsers(u);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const known = new Set(CONNECTOR_PARAMS.map((p) => p.code));
  const list = useMemo(() => {
    const byCode = new Map((defs ?? []).map((d) => [String(d.code), d]));
    const codes = onlyConnector ? CONNECTOR_PARAMS.map((p) => p.code) : [...byCode.keys()].sort();
    return codes.map((code) => ({ code, def: byCode.get(code) ?? null, values: vals.filter((v) => v.code === code) }));
  }, [defs, vals, onlyConnector]);

  const show = (code: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return <span className="muted">empty</span>;
    return looksSecret(code) ? <span className="badge EXACT">set (hidden)</span> : <span className="mono">{String(v)}</span>;
  };

  return (
    <>
      <SchemaLoader index={index} loading={loading} error={error} onLoad={(r) => void load(r)} />
      {index && (
        <Card
          title="Connector parameters (YCAPI)"
          actions={
            <Button variant="primary" onClick={() => void refresh()} disabled={busy} title="Read the general parameters Y* and the YMODTEST user parameter with GraphQL">
              {busy ? <Spinner /> : defs ? 'Refresh' : 'Load parameters'}
            </Button>
          }
        >
          <p className="small muted">
            Values read in X3 (x3System.generalParameter / generalParametersData), roles taken from the connector source analysis (skill connecteur-dhm-fli). Secrets are never displayed.
          </p>
          <label className="checkbox small">
            <input type="checkbox" checked={onlyConnector} onChange={(e) => setOnlyConnector(e.target.checked)} /> Connector parameters only (uncheck: every Y* parameter of the folder)
          </label>
          {err && <Message kind="error">{err}</Message>}
          {defs && (
            <div className="grid-wrap" style={{ maxHeight: 520, marginTop: 6 }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Folder value</th>
                    <th>Company / site values</th>
                    <th>Role in the connector</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(({ code, def, values }) => {
                    const info = connectorParam(code);
                    return (
                      <tr key={code}>
                        <td>
                          <div className="mono">{code}</div>
                          <div className="small muted">{def ? String(def.description ?? '') : 'not found in this folder'}</div>
                          {def?.localMenu ? <div className="small muted">local menu {String(def.localMenu)}</div> : null}
                        </td>
                        <td>{def ? show(code, def.folderValue) : '-'}</td>
                        <td className="small">
                          {values.length === 0
                            ? <span className="muted">none</span>
                            : values.map((v, i) => (
                                <div key={i}>
                                  {String(v.company ?? '') || String(v.siteOrLegislationCode ?? '') || 'level ?'}: {show(code, v.value)}
                                </div>
                              ))}
                        </td>
                        <td className="small">{info ? info.role : known.has(code) ? '' : <span className="muted">not a connector parameter</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {defs && (
        <Card title="User parameter YMODTEST (debug mode)">
          <p className="small muted">{CONNECTOR_USER_PARAMS[0]?.role}</p>
          {users.length === 0 ? (
            <p className="small muted">No user has a YMODTEST value (or the parameter is not readable).</p>
          ) : (
            <ul className="list small">
              {users.map((u, i) => (
                <li key={i}>
                  <span className="mono">{String(u.user ?? '?')}</span> = {String(u.value ?? '')}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
