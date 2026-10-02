import type { Sourced } from '@x3i/shared';
import { useState } from 'react';
import { SourcedValue } from '../../components/provenance';
import { Button } from '../../components/ui';

/** One context value with its provenance and a manual override editor. */
export function ContextRow({
  label,
  value,
  overridden,
  onOverride,
}: {
  label: string;
  value: Sourced<string>;
  overridden: boolean;
  onOverride: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <>
      <div className="k">{label}</div>
      <div className="v">
        {editing ? (
          <div className="inline">
            <input
              className="input mono"
              value={draft}
              autoFocus
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onOverride(draft);
                  setEditing(false);
                } else if (e.key === 'Escape') setEditing(false);
              }}
            />
            <Button
              small
              variant="primary"
              onClick={() => {
                onOverride(draft);
                setEditing(false);
              }}
            >
              Set
            </Button>
          </div>
        ) : (
          <>
            <SourcedValue value={value} />
            <span className="btn-row" style={{ marginTop: 2 }}>
              <button
                type="button"
                className="link small"
                onClick={() => {
                  setDraft(value.value ?? '');
                  setEditing(true);
                }}
              >
                {value.value ? 'correct' : 'set manually'}
              </button>
              {overridden && (
                <button type="button" className="link small" onClick={() => onOverride(null)}>
                  reset to detected
                </button>
              )}
            </span>
          </>
        )}
      </div>
    </>
  );
}
