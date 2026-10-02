import { toCsv, toJson, type RecordRow } from '@x3i/x3-core';
import { useMemo, useState } from 'react';
import { copyText, downloadText, exportFileName } from '../../../lib/clipboard';
import { Button, CopyButton } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';

type FillFilter = 'all' | 'filled' | 'empty';

const isEmpty = (v: string | null) => v === null || v.trim() === '';

/** One line per GraphQL property, with the X3 field code read from the schema description. */
export function GqlRecordGrid({ rows, highlight, name }: { rows: RecordRow[]; highlight: string | null; name: string }) {
  const { settings } = useSettings();
  const [search, setSearch] = useState('');
  const [fill, setFill] = useState<FillFilter>('filled');
  const [copied, setCopied] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows.filter((r) => {
      if (r.kind === 'collection') return false;
      if (fill === 'filled' && isEmpty(r.value)) return false;
      if (fill === 'empty' && !isEmpty(r.value)) return false;
      if (!q) return true;
      return [r.prop, r.x3Field ?? '', r.label, r.value ?? ''].some((s) => s.toUpperCase().includes(q));
    });
  }, [rows, search, fill]);
  const collections = rows.filter((r) => r.kind === 'collection');
  const exportRows = visible.map((r) => ({ X3Field: r.x3Field, Property: r.prop, Label: r.label, Value: r.value }));
  const record = Object.fromEntries(rows.filter((r) => r.kind !== 'collection').map((r) => [r.prop, r.value]));

  return (
    <>
      <div className="inline" style={{ marginBottom: 6 }}>
        <input className="input" placeholder="Search X3 field, property, label or value" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <select className="input" style={{ width: 'auto' }} value={fill} onChange={(e) => setFill(e.target.value as FillFilter)}>
          <option value="all">All values</option>
          <option value="filled">Filled</option>
          <option value="empty">Empty</option>
        </select>
        <span className="small muted">
          {visible.length}/{rows.length - collections.length}
        </span>
      </div>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>X3 field</th>
              <th>Label</th>
              <th>Value</th>
              <th>GraphQL property</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.prop} style={highlight && r.x3Field === highlight ? { background: 'rgba(1,118,211,.12)' } : undefined}>
                <td className="mono">{r.x3Field ?? <span className="muted">-</span>}</td>
                <td>{r.label}</td>
                <td
                  className={`copyable${r.value === null ? ' null' : ''}`}
                  title="Click to copy"
                  onClick={async () => {
                    if (r.value !== null && (await copyText(r.value))) {
                      setCopied(r.prop);
                      setTimeout(() => setCopied(null), 1200);
                    }
                  }}
                >
                  {r.value === null ? 'null' : r.value}
                  {r.kind === 'reference' && r.value ? <span className="src"> (reference)</span> : null}
                </td>
                <td className="mono small">{r.prop}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {copied && <div className="small muted">Copied value of {copied}</div>}
      {collections.length > 0 && (
        <p className="small muted">
          Sub-collections not read in this version: {collections.map((c) => (c.x3Field ? `${c.prop} (${c.x3Field})` : c.prop)).join(', ')}
        </p>
      )}
      <div className="btn-row" style={{ marginTop: 6 }}>
        <CopyButton label="Copy JSON" value={toJson(record)} />
        <Button small onClick={() => downloadText(exportFileName(name, 'json'), toJson(record), 'application/json')}>
          Export JSON
        </Button>
        <Button
          small
          onClick={() => downloadText(exportFileName(name, 'csv'), toCsv(['X3Field', 'Property', 'Label', 'Value'], exportRows, { separator: settings.csvSeparator, bom: true }), 'text/csv')}
        >
          Export CSV
        </Button>
      </div>
    </>
  );
}
