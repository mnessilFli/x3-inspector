import { buildNodeMetaQuery, nodeKeyField, parseNodeMeta, targetNode, type GqlNode, type NodeMeta } from '@x3i/x3-core';
import { useEffect, useMemo, useState } from 'react';
import { runGraphqlInActiveTab } from '../../../lib/sessionGraphql';
import { Button, Card, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { useSchemaIndex } from '../../state/useSchemaIndex';
import { SchemaLoader } from '../query/SchemaLoader';

/** Salesforce "describe" for X3 objects: properties, X3 field codes, lookups, stored or calculated. */
export function ObjectExplorer() {
  const { index, loading, error, load } = useSchemaIndex();
  const nav = useNav();
  const [search, setSearch] = useState('');
  const [node, setNode] = useState<GqlNode | null>(null);
  const [filter, setFilter] = useState('');
  const [meta, setMeta] = useState<NodeMeta | null>(null);
  const [metaState, setMetaState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    const i = nav.objectIntent;
    if (!i || !index) return;
    const n = index.nodes.find((x) => x.node === i.node);
    if (n) setNode(n);
  }, [nav.objectIntent?.nonce, index]);

  // the schema can be reloaded (other X3 page, extension update): the selected object must follow it
  useEffect(() => {
    if (!index) setNode(null);
    else setNode((n) => (n ? (index.nodes.find((x) => x.pkg === n.pkg && x.node === n.node) ?? null) : null));
  }, [index]);

  useEffect(() => {
    setMeta(null);
    setMetaState('idle');
    setMetaError(null);
  }, [node]);

  const nodes = useMemo(() => {
    if (!index) return [];
    const q = search.trim().toLowerCase();
    return index.nodes
      .filter((n) => !q || n.node.toLowerCase().includes(q) || n.typeName.toLowerCase().includes(q) || (nodeKeyField(n) ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.node.length - b.node.length || a.node.localeCompare(b.node))
      .slice(0, 40);
  }, [index, search]);

  const props = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (node?.props ?? []).filter((p) => p.kind !== 'other' && (!q || [p.name, p.x3Field ?? '', p.label].some((s) => s.toLowerCase().includes(q))));
  }, [node, filter]);

  const loadMeta = async () => {
    if (!node) return;
    setMetaState('loading');
    const r = await runGraphqlInActiveTab(buildNodeMetaQuery(node.typeName));
    const m = parseNodeMeta(r.body);
    if (m) {
      setMeta(m);
      setMetaState('idle');
    } else {
      setMetaState('error');
      const errs = (r.body as { errors?: Array<{ message?: string }> } | undefined)?.errors;
      setMetaError(errs?.[0]?.message ?? r.error ?? `No xtremMetadata entry named ${node.typeName}`);
    }
  };

  const yesNo = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : '');

  return (
    <>
      <SchemaLoader index={index} loading={loading} error={error} onLoad={(r) => void load(r)} />
      {index && (
        <Card title="Object explorer">
          <input className="input" placeholder="Search an object: customer, salesOrder, BPCNUM..." value={search} onChange={(e) => setSearch(e.target.value)} />
          {!node || search ? (
            <ul className="list" style={{ maxHeight: 220, overflowY: 'auto', marginTop: 6 }}>
              {nodes.map((n) => (
                <li key={`${n.pkg}.${n.node}`}>
                  <button
                    type="button"
                    className="link mono"
                    onClick={() => {
                      setNode(n);
                      setSearch('');
                    }}
                  >
                    {n.node}
                  </button>{' '}
                  <span className="small muted">
                    {n.pkg}
                    {nodeKeyField(n) ? ` · key ${nodeKeyField(n)}` : ''} · {n.props.length} properties
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      )}
      {node && index && (
        <Card
          title={`${node.pkg}.${node.node}`}
          actions={
            <>
              <Button small onClick={() => void loadMeta()} disabled={metaState === 'loading'} title="Reads xtremMetadata: stored or calculated, required, lookup target">
                {metaState === 'loading' ? <Spinner /> : 'Stored / required'}
              </Button>
              <Button
                small
                variant="primary"
                title="Open QUERY with all readable fields of this object"
                onClick={() => nav.openX3ql(`SELECT * FROM ${node.node} LIMIT 20`, true)}
              >
                Query
              </Button>
            </>
          }
        >
          <p className="small muted">
            GraphQL type {node.typeName}
            {nodeKeyField(node) ? ` · key X3 field ${nodeKeyField(node)}` : ''}
            {meta?.storage ? ` · storage ${meta.storage}` : ''}. A property without X3 code is usually not a column of the X3 table: check "Stored".
          </p>
          {metaState === 'error' && <Message kind="warn">Metadata not available: {metaError}</Message>}
          <input className="input" placeholder="Filter: name, X3 code or label" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ margin: '6px 0' }} />
          <div className="grid-wrap" style={{ maxHeight: 460 }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>X3 field</th>
                  <th>Property</th>
                  <th>Label</th>
                  <th>Type / lookup</th>
                  {meta && <th title="Stored in the database (No = calculated)">Stored</th>}
                  {meta && <th>Required</th>}
                </tr>
              </thead>
              <tbody>
                {props.map((p) => {
                  const target = p.kind === 'reference' ? targetNode(index, p) : undefined;
                  const m = meta?.props.get(p.name);
                  return (
                    <tr key={p.name}>
                      <td className="mono">{p.x3Field ?? <span className="muted">-</span>}</td>
                      <td className="mono small">{p.name}</td>
                      <td>{p.label}</td>
                      <td className="small">
                        {target ? (
                          <button type="button" className="link mono" title="Open the referenced object" onClick={() => setNode(target)}>
                            → {target.node}
                          </button>
                        ) : p.kind === 'collection' ? (
                          'sub-collection'
                        ) : (
                          p.typeName
                        )}
                      </td>
                      {meta && <td style={m?.isStored === false ? { color: '#a96404', fontWeight: 600 } : undefined}>{m ? (m.isStored === false ? 'No (calculated)' : yesNo(m.isStored)) : ''}</td>}
                      {meta && <td>{yesNo(m?.isRequired)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
