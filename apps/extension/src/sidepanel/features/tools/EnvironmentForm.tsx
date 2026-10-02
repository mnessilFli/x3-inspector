import { ENVIRONMENT_KINDS, type CompanionEnvironmentInfo, type EnvironmentKind, type ExtensionEnvironment } from '@x3i/shared';
import { useEffect, useState } from 'react';
import { CompanionClient, errorMessage } from '../../../lib/companionClient';
import { hasHostPermission, matchPatternOf, requestHostPermission } from '../../../lib/env';
import { loadToken } from '../../../lib/storage';
import { Button, Message } from '../../components/ui';

/** Edits one environment. No secret here: the pairing token is managed per companion URL. */
export function EnvironmentForm({ env, onSave, onDelete }: { env: ExtensionEnvironment; onSave: (e: ExtensionEnvironment) => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(env);
  const [remoteEnvs, setRemoteEnvs] = useState<CompanionEnvironmentInfo[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => setDraft(env), [env]);
  useEffect(() => {
    if (draft.x3Url) void hasHostPermission(draft.x3Url).then(setGranted);
    else setGranted(null);
  }, [draft.x3Url]);

  const set = <K extends keyof ExtensionEnvironment>(k: K, v: ExtensionEnvironment[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(env);
  const pattern = draft.x3Url ? matchPatternOf(draft.x3Url) : undefined;

  const loadRemote = async () => {
    setMsg(null);
    try {
      const token = await loadToken(draft.companionUrl);
      const list = await new CompanionClient(draft.companionUrl, token, undefined).environments();
      setRemoteEnvs(list);
      if (list.length === 0) setMsg({ kind: 'info', text: 'The companion has no environment configured.' });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    }
  };

  return (
    <div>
      <div className="form-grid">
        <label>Name</label>
        <input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} />
        <label>Type</label>
        <select className="input" value={draft.kind} onChange={(e) => set('kind', e.target.value as EnvironmentKind)}>
          {ENVIRONMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <label>X3 URL</label>
        <input className="input mono" placeholder="http://x3server:8124" value={draft.x3Url} onChange={(e) => set('x3Url', e.target.value.trim())} />
        <label>Folder</label>
        <input className="input mono" placeholder="SEED" value={draft.folder} onChange={(e) => set('folder', e.target.value.trim().toUpperCase())} />
        <label>Companion URL</label>
        <input className="input mono" value={draft.companionUrl} onChange={(e) => set('companionUrl', e.target.value.trim())} />
        <label>Companion env id</label>
        <div className="inline">
          {remoteEnvs && remoteEnvs.length > 0 ? (
            <select
              className="input"
              value={draft.companionEnvId}
              onChange={(e) => {
                const r = remoteEnvs.find((x) => x.id === e.target.value);
                setDraft((d) => ({ ...d, companionEnvId: e.target.value, ...(r && d.name === 'New environment' ? { name: r.name, kind: r.kind } : {}) }));
              }}
            >
              <option value="">Choose...</option>
              {remoteEnvs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} · {r.name} ({r.kind}{r.database ? `, ${r.database.type} ${r.database.schema}` : ', offline metadata'})
                </option>
              ))}
            </select>
          ) : (
            <input className="input mono" value={draft.companionEnvId} onChange={(e) => set('companionEnvId', e.target.value.trim())} />
          )}
          <Button small onClick={() => void loadRemote()}>
            Load from companion
          </Button>
        </div>
      </div>
      {draft.kind === 'PROD' && (
        <div style={{ marginTop: 6 }}>
          <Message kind="warn">🔴 PROD environment: a permanent red banner is shown. Access stays READ ONLY.</Message>
        </div>
      )}
      {msg && (
        <div style={{ marginTop: 6 }}>
          <Message kind={msg.kind}>{msg.text}</Message>
        </div>
      )}
      <div className="btn-row" style={{ marginTop: 8 }}>
        <Button variant="primary" disabled={!dirty} onClick={() => onSave(draft)}>
          Save
        </Button>
        {pattern && (
          <Button
            disabled={granted === true}
            onClick={async () => {
              const ok = await requestHostPermission(draft.x3Url);
              setGranted(ok);
            }}
          >
            {granted ? `Access granted (${pattern})` : `Grant access to ${pattern}`}
          </Button>
        )}
        <Button variant="danger" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}
