import type { EnvironmentStatus, HealthResponse } from '@x3i/shared';
import { useEffect, useState } from 'react';
import { CompanionClient, errorMessage } from '../../../lib/companionClient';
import { loadToken } from '../../../lib/storage';
import { Button, Message, Spinner } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';

/** Pairing token of the active environment's companion + connection test. */
export function CompanionPairing() {
  const { activeEnv, setToken, refreshStatus } = useSettings();
  const [token, setTokenDraft] = useState('');
  const [stored, setStored] = useState(false);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = activeEnv?.companionUrl ?? '';

  useEffect(() => {
    setTokenDraft('');
    setHealth(null);
    setStatus(null);
    setError(null);
    if (url) void loadToken(url).then((t) => setStored(Boolean(t)));
  }, [url]);

  if (!activeEnv) return <p className="small muted">Create an environment first.</p>;

  const test = async () => {
    setTesting(true);
    setError(null);
    setHealth(null);
    setStatus(null);
    try {
      const t = await loadToken(url);
      const c = new CompanionClient(url, t, activeEnv.companionEnvId || undefined);
      const h = await c.health();
      setHealth(h);
      if (!h.authenticated) throw new Error('Companion reachable but the pairing token is missing or refused.');
      if (!activeEnv.companionEnvId) throw new Error('Companion env id not set for this environment.');
      setStatus(await c.status());
      refreshStatus();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <p className="small muted">
        The token is printed by the companion at startup (file <code>apps/companion/config/.companion-token</code>). It is kept in this browser only
        (chrome.storage.local), never synced. Database credentials never reach the extension.
      </p>
      <div className="inline">
        <input className="input mono" type="password" autoComplete="off" placeholder={stored ? 'Token stored (enter a new one to replace it)' : 'Paste the pairing token'} value={token} onChange={(e) => setTokenDraft(e.target.value)} />
        <Button
          small
          variant="primary"
          disabled={!token.trim()}
          onClick={async () => {
            await setToken(url, token);
            setTokenDraft('');
            setStored(true);
          }}
        >
          Save
        </Button>
        {stored && (
          <Button
            small
            variant="danger"
            onClick={async () => {
              await setToken(url, '');
              setStored(false);
            }}
          >
            Forget
          </Button>
        )}
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <Button onClick={() => void test()} disabled={testing}>
          {testing ? <Spinner /> : 'Test connection'}
        </Button>
        <span className="small muted mono">{url}</span>
      </div>
      {health && (
        <div style={{ marginTop: 6 }}>
          <Message kind="ok">
            Companion {health.version} reachable · {health.authenticated ? 'token accepted' : 'not authenticated'}
          </Message>
        </div>
      )}
      {status && (
        <div style={{ marginTop: 6 }}>
          <Message kind={status.connection === 'ok' ? 'ok' : status.connection === 'error' ? 'error' : 'info'}>
            {status.environment.name} ({status.environment.kind}) · database: {status.connection} · {status.message}
            {status.tableCount !== null && <> · {status.tableCount} tables</>}
          </Message>
          {status.writeAccessWarning && (
            <Message kind="warn">The SQL login has write rights (db_owner or db_datawriter). Ask for a read-only account.</Message>
          )}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 6 }}>
          <Message kind="error">{error}</Message>
        </div>
      )}
    </div>
  );
}
