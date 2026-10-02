import type { CellValue } from '@x3i/shared';
import { toCsv, toJson } from '@x3i/x3-core';
import { useState } from 'react';
import { copyText, downloadText, exportFileName } from '../../lib/clipboard';
import { useSettings } from '../state/SettingsContext';
import { Button, CopyButton } from './ui';

export interface GridProps {
  columns: string[];
  rows: Array<Record<string, CellValue>>;
  maxHeight?: number;
}

/** Read-only result grid: sticky header, horizontal scroll inside, click a cell to copy it. */
export function ResultGrid({ columns, rows, maxHeight }: GridProps) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div>
      <div className="grid-wrap" style={maxHeight ? { maxHeight } : undefined}>
        <table className="grid">
          <thead>
            <tr>
              <th className="muted">#</th>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="muted num">{i + 1}</td>
                {columns.map((c) => {
                  const v = r[c];
                  const isNull = v === null || v === undefined;
                  return (
                    <td
                      key={c}
                      className={`copyable${isNull ? ' null' : ''}${typeof v === 'number' ? ' num' : ''}`}
                      title={isNull ? 'NULL' : String(v)}
                      onClick={async () => {
                        if (!isNull && (await copyText(String(v)))) {
                          setCopied(`${c} = ${String(v)}`);
                          setTimeout(() => setCopied(null), 1200);
                        }
                      }}
                    >
                      {isNull ? 'NULL' : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {copied && <div className="small muted">Copied {copied}</div>}
    </div>
  );
}

/** Copy / download buttons for a result set. */
export function ExportBar({ columns, rows, baseName }: { columns: string[]; rows: Array<Record<string, CellValue>>; baseName: string }) {
  const { settings } = useSettings();
  const sep = settings.csvSeparator;
  const disabled = rows.length === 0;
  return (
    <div className="btn-row">
      <CopyButton label="Copy CSV" value={disabled ? '' : toCsv(columns, rows, { separator: sep })} />
      <CopyButton label="Copy JSON" value={disabled ? '' : toJson(rows)} />
      <Button small disabled={disabled} onClick={() => downloadText(exportFileName(baseName, 'csv'), toCsv(columns, rows, { separator: sep, bom: true }), 'text/csv')}>
        Download CSV
      </Button>
      <Button small disabled={disabled} onClick={() => downloadText(exportFileName(baseName, 'json'), toJson(rows), 'application/json')}>
        Download JSON
      </Button>
    </div>
  );
}
