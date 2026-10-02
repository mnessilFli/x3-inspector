import type { X3TableSummary } from '@x3i/shared';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../lib/companionClient';
import { useSettings } from '../state/SettingsContext';

/** Table input with debounced suggestions on name, abbreviation and description. */
export function TableAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Table, abbreviation or description (e.g. BPC)',
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (table: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { client } = useSettings();
  const [items, setItems] = useState<X3TableSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open || !client || !value.trim()) {
      setItems([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(() => {
      client
        .searchTables(value.trim(), 30)
        .then((r) => {
          if (n === seq.current) {
            setItems(r);
            setSel(0);
            setError(null);
          }
        })
        .catch((e: unknown) => n === seq.current && setError(errorMessage(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [value, open, client]);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    onSelect(name);
  };

  return (
    <div className="ac">
      <input
        className="input mono"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            setSel((s) => Math.min(s + 1, items.length - 1));
            e.preventDefault();
          } else if (e.key === 'ArrowUp') {
            setSel((s) => Math.max(s - 1, 0));
            e.preventDefault();
          } else if (e.key === 'Enter') {
            const it = open ? items[sel] : undefined;
            pick(it ? it.name : value.trim().toUpperCase());
            e.preventDefault();
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (items.length > 0 || error) && (
        <div className="ac-list">
          {error && <div className="ac-item msg error">{error}</div>}
          {items.map((t, i) => (
            <div key={t.name} className={`ac-item${i === sel ? ' sel' : ''}`} onMouseDown={() => pick(t.name)}>
              <span className="name">{t.name}</span>
              {t.abbreviation && <span className="muted mono">{t.abbreviation.value}</span>}
              {t.description && <span className="desc">· {t.description.value}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
