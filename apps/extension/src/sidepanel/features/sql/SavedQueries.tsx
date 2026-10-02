import { useEffect, useState } from 'react';
import { clearHistory, loadFavorites, loadHistory, saveFavorites, type Favorite, type HistoryEntry } from '../../../lib/storage';
import { Button } from '../../components/ui';

/** History and favorites dropdowns plus "Save query". Local storage only, no secret. */
export function SavedQueries({ sql, envId, historyVersion, onPick }: { sql: string; envId: string | null; historyVersion: number; onPick: (sql: string) => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [label, setLabel] = useState('');

  useEffect(() => {
    void loadHistory().then(setHistory);
  }, [historyVersion]);
  useEffect(() => {
    void loadFavorites().then(setFavorites);
  }, []);

  const save = async () => {
    const name = label.trim() || sql.trim().slice(0, 40);
    const next = [{ id: crypto.randomUUID(), label: name, sql, envId, savedAt: new Date().toISOString() }, ...favorites.filter((f) => f.label !== name)];
    await saveFavorites(next);
    setFavorites(next);
    setLabel('');
  };

  const remove = async (id: string) => {
    const next = favorites.filter((f) => f.id !== id);
    await saveFavorites(next);
    setFavorites(next);
  };

  return (
    <>
      <div className="inline">
        <select className="input" value="" onChange={(e) => e.target.value && onPick(e.target.value)} title="Query history">
          <option value="">History ({history.length})</option>
          {history.map((h, i) => (
            <option key={i} value={h.sql}>
              {new Date(h.at).toLocaleString()} · {h.sql.replace(/\s+/g, ' ').slice(0, 60)}
            </option>
          ))}
        </select>
        <select
          className="input"
          value=""
          onChange={(e) => {
            const f = favorites.find((x) => x.id === e.target.value);
            if (f) onPick(f.sql);
          }}
          title="Saved queries"
        >
          <option value="">Saved ({favorites.length})</option>
          {favorites.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="inline" style={{ marginTop: 6 }}>
        <input className="input" placeholder="Query label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button small disabled={!sql.trim()} onClick={() => void save()}>
          Save query
        </Button>
      </div>
      {(favorites.length > 0 || history.length > 0) && (
        <details className="collapsible">
          <summary>Manage saved queries</summary>
          <ul className="list">
            {favorites.map((f) => (
              <li key={f.id}>
                <button type="button" className="link" onClick={() => onPick(f.sql)}>
                  {f.label}
                </button>{' '}
                <button type="button" className="link small" onClick={() => void remove(f.id)}>
                  delete
                </button>
              </li>
            ))}
          </ul>
          <Button
            small
            variant="danger"
            onClick={async () => {
              await clearHistory();
              setHistory([]);
            }}
          >
            Clear history
          </Button>
        </details>
      )}
    </>
  );
}
