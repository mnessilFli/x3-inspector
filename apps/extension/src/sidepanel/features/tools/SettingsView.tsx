import type { ExtensionEnvironment } from '@x3i/shared';
import { useState } from 'react';
import { newDefaultEnvironment } from '../../../lib/storage';
import { Button, Card } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';
import { CompanionPairing } from './CompanionPairing';
import { EnvironmentForm } from './EnvironmentForm';
import { PageRulesEditor } from './PageRulesEditor';

export function SettingsView() {
  const { settings, update, activeEnv } = useSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = settings.environments.find((e) => e.id === editingId) ?? null;

  const saveEnv = (env: ExtensionEnvironment) => {
    const exists = settings.environments.some((e) => e.id === env.id);
    const environments = exists ? settings.environments.map((e) => (e.id === env.id ? env : e)) : [...settings.environments, env];
    void update({ environments, activeEnvId: settings.activeEnvId ?? env.id });
  };

  return (
    <>
      <Card
        title="Environments"
        actions={
          <Button
            small
            variant="primary"
            onClick={() => {
              const env = newDefaultEnvironment();
              void update({ environments: [...settings.environments, env], activeEnvId: settings.activeEnvId ?? env.id });
              setEditingId(env.id);
            }}
          >
            Add
          </Button>
        }
      >
        {settings.environments.length === 0 && <p className="small muted">No environment yet. Add one: X3 URL, folder and the companion that serves it.</p>}
        <ul className="list">
          {settings.environments.map((e) => (
            <li key={e.id}>
              <span className={`pill env-${e.kind}`}>{e.kind === 'PROD' ? '🔴 PROD' : e.kind}</span> <b>{e.name}</b> <span className="muted mono small">{e.folder}</span>
              {activeEnv?.id === e.id ? (
                <span className="badge EXACT">ACTIVE</span>
              ) : (
                <button type="button" className="link small" style={{ marginLeft: 6 }} onClick={() => void update({ activeEnvId: e.id })}>
                  activate
                </button>
              )}
              <button type="button" className="link small" style={{ marginLeft: 6 }} onClick={() => setEditingId(editingId === e.id ? null : e.id)}>
                {editingId === e.id ? 'close' : 'edit'}
              </button>
              <div className="src mono">{e.x3Url || 'no X3 URL'}</div>
              {editingId === e.id && editing && (
                <div style={{ marginTop: 6 }}>
                  <EnvironmentForm
                    env={editing}
                    onSave={saveEnv}
                    onDelete={() => {
                      const environments = settings.environments.filter((x) => x.id !== e.id);
                      void update({ environments, activeEnvId: settings.activeEnvId === e.id ? (environments[0]?.id ?? null) : settings.activeEnvId });
                      setEditingId(null);
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={`Companion pairing${activeEnv ? ` · ${activeEnv.name}` : ''}`}>
        <CompanionPairing />
      </Card>

      <Card title="General">
        <div className="form-grid">
          <label>Default max rows</label>
          <input
            className="input"
            type="number"
            min={1}
            max={50000}
            value={settings.defaultMaxRows}
            onChange={(e) => void update({ defaultMaxRows: Math.max(1, Number(e.target.value) || 500) })}
          />
          <label>CSV separator</label>
          <select className="input" value={settings.csvSeparator} onChange={(e) => void update({ csvSeparator: e.target.value === ';' ? ';' : ',' })}>
            <option value=",">, (comma)</option>
            <option value=";">; (semicolon, French Excel)</option>
          </select>
          <label>Debug logs</label>
          <label className="checkbox">
            <input type="checkbox" checked={settings.debug} onChange={(e) => void update({ debug: e.target.checked })} /> log details in the consoles
          </label>
        </div>
        <p className="small muted">
          Shortcuts: Alt+X opens X3 Inspector, Ctrl+Shift+X toggles Inspect field. Change them in chrome://extensions/shortcuts.
        </p>
      </Card>

      <Card title="Page detection rules">
        <PageRulesEditor />
      </Card>
    </>
  );
}
