import type { X3Field } from '@x3i/shared';
import { useMemo, useState } from 'react';
import { CustomBadge } from '../../components/provenance';

/** Fields of a table with an instant filter on name and label. */
export function FieldsGrid({ fields, onField }: { fields: X3Field[]; onField?: (f: X3Field) => void }) {
  const [filter, setFilter] = useState('');
  const list = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return fields;
    return fields.filter((f) => f.name.toUpperCase().includes(q) || f.label?.value.toUpperCase().includes(q) || f.columns.some((c) => c.name.toUpperCase().includes(q)));
  }, [fields, filter]);

  return (
    <>
      <div className="inline" style={{ marginBottom: 6 }}>
        <input className="input" placeholder="Filter fields (name or label)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="small muted">
          {list.length}/{fields.length}
        </span>
      </div>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Field</th>
              <th>Label</th>
              <th>Type</th>
              <th>Length</th>
              <th>Dim</th>
              <th>Menu</th>
              <th>Linked table</th>
              <th>Activity</th>
              <th>Custom</th>
            </tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.name} className={onField ? 'clickable' : ''} onClick={() => onField?.(f)}>
                <td className="mono" title={f.columns.map((c) => c.name).join(', ')}>
                  {f.isKey ? '🔑 ' : ''}
                  {f.name}
                  {f.technical ? <span className="muted"> (tech)</span> : null}
                </td>
                <td title={f.label ? `${f.label.prov.confidence} · ${f.label.prov.detail ?? ''}` : 'Unknown'}>{f.label?.value ?? <span className="muted">-</span>}</td>
                <td className="mono" title={`SQL ${f.sqlType}`}>
                  {f.x3Type?.value ?? <span className="muted">{f.sqlType}</span>}
                </td>
                <td className="num">{f.x3Length?.value ?? f.length ?? ''}</td>
                <td className="num">{f.dimension}</td>
                <td className="num">{f.localMenu?.value ?? ''}</td>
                <td className="mono">{f.linkedTable?.value ?? ''}</td>
                <td className="mono">{f.activityCode?.value ?? ''}</td>
                <td>
                  <CustomBadge flag={f.custom} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
