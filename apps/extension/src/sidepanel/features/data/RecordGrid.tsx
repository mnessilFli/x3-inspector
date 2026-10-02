import type { CellValue, X3Field, X3LocalMenu, X3Table } from '@x3i/shared';
import { toCsv, toJson } from '@x3i/x3-core';
import { useEffect, useMemo, useState } from 'react';
import { copyText, downloadText, exportFileName } from '../../../lib/clipboard';
import { getLocalMenuCached } from '../../../lib/metadataCache';
import { CustomBadge } from '../../components/provenance';
import { Button, CopyButton } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';
import { menuLabel } from '../current/LocalMenuInfo';

interface Line {
  field: X3Field;
  column: string;
  value: CellValue;
  display: string;
}

type FillFilter = 'all' | 'filled' | 'empty';
type CustomFilter = 'all' | 'standard' | 'custom';

function isEmpty(v: CellValue): boolean {
  return v === null || (typeof v === 'string' && v.trim() === '') || v === 0;
}

/** Salesforce Inspector style record view: one line per physical column. */
export function RecordGrid({ table, row }: { table: X3Table; row: Record<string, CellValue> }) {
  const { client, settings } = useSettings();
  const [search, setSearch] = useState('');
  const [fill, setFill] = useState<FillFilter>('all');
  const [custom, setCustom] = useState<CustomFilter>('all');
  const [showLabels, setShowLabels] = useState(false);
  const [hideTechnical, setHideTechnical] = useState(false);
  const [menus, setMenus] = useState<Record<number, X3LocalMenu | null>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    const ids = [...new Set(table.fields.map((f) => f.localMenu?.value).filter((m): m is number => m !== undefined))];
    let cancelled = false;
    void Promise.all(ids.map((m) => getLocalMenuCached(client, m).then((r) => [m, r] as const).catch(() => [m, null] as const))).then((pairs) => {
      if (!cancelled) setMenus(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [table, client]);

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    for (const f of table.fields) {
      for (const c of f.columns) {
        const value = row[c.name] ?? null;
        const m = f.localMenu ? menus[f.localMenu.value] : undefined;
        out.push({ field: f, column: c.name, value, display: menuLabel(m, value) ?? (value === null ? 'NULL' : String(value)) });
      }
    }
    return out;
  }, [table, row, menus]);

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    return lines.filter((l) => {
      if (hideTechnical && l.field.technical) return false;
      if (fill === 'filled' && isEmpty(l.value)) return false;
      if (fill === 'empty' && !isEmpty(l.value)) return false;
      if (custom === 'standard' && l.field.custom.level !== 'standard') return false;
      if (custom === 'custom' && l.field.custom.level === 'standard') return false;
      if (!q) return true;
      return l.column.toUpperCase().includes(q) || (l.field.label?.value.toUpperCase().includes(q) ?? false) || l.display.toUpperCase().includes(q);
    });
  }, [lines, search, fill, custom, hideTechnical]);

  const exportRows = visible.map((l) => ({ Field: l.column, Label: l.field.label?.value ?? null, Value: l.value, Display: l.display, Type: l.field.x3Type?.value ?? l.field.sqlType, Custom: l.field.custom.level }));
  const exportCols = ['Field', 'Label', 'Value', 'Display', 'Type', 'Custom'];

  return (
    <>
      <div className="inline" style={{ marginBottom: 6 }}>
        <input className="input" placeholder="Search field, label or value" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <select className="input" style={{ width: 'auto' }} value={fill} onChange={(e) => setFill(e.target.value as FillFilter)}>
          <option value="all">All values</option>
          <option value="filled">Filled</option>
          <option value="empty">Empty</option>
        </select>
        <select className="input" style={{ width: 'auto' }} value={custom} onChange={(e) => setCustom(e.target.value as CustomFilter)}>
          <option value="all">Standard + custom</option>
          <option value="standard">Standard</option>
          <option value="custom">Custom (X/Y/Z)</option>
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels first
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={hideTechnical} onChange={(e) => setHideTechnical(e.target.checked)} /> Hide technical
        </label>
        <span className="small muted">
          {visible.length}/{lines.length}
        </span>
      </div>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>{showLabels ? 'Label' : 'Field'}</th>
              <th>{showLabels ? 'Field' : 'Label'}</th>
              <th>Value</th>
              <th>Type</th>
              <th>Custom</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => {
              const label = l.field.label?.value ?? '';
              return (
                <tr key={l.column}>
                  <td className={showLabels ? '' : 'mono'}>{showLabels ? label || <span className="muted">{l.column}</span> : `${l.field.isKey ? '🔑 ' : ''}${l.column}`}</td>
                  <td className={showLabels ? 'mono' : ''}>{showLabels ? l.column : label}</td>
                  <td
                    className={`copyable${l.value === null ? ' null' : ''}`}
                    title={`Click to copy · raw value: ${l.value === null ? 'NULL' : String(l.value)}`}
                    onClick={async () => {
                      if (l.value !== null && (await copyText(String(l.value)))) {
                        setCopied(l.column);
                        setTimeout(() => setCopied(null), 1200);
                      }
                    }}
                  >
                    {l.display}
                  </td>
                  <td className="mono">{l.field.x3Type?.value ?? l.field.sqlType}</td>
                  <td>
                    <CustomBadge flag={l.field.custom} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {copied && <div className="small muted">Copied value of {copied}</div>}
      <div className="btn-row" style={{ marginTop: 6 }}>
        <CopyButton label="Copy JSON" value={toJson(row)} />
        <Button small onClick={() => downloadText(exportFileName(table.name, 'json'), toJson(row), 'application/json')}>
          Export JSON
        </Button>
        <Button small onClick={() => downloadText(exportFileName(table.name, 'csv'), toCsv(exportCols, exportRows, { separator: settings.csvSeparator, bom: true }), 'text/csv')}>
          Export CSV
        </Button>
      </div>
    </>
  );
}
