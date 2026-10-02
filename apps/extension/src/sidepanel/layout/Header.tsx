import { useSettings } from '../state/SettingsContext';

export function Header() {
  const { settings, update, activeEnv, status, statusError, statusLoading } = useSettings();
  const kind = activeEnv?.kind;
  const db = status?.environment.database;
  const dotClass = status ? 'ok' : statusError ? 'error' : '';
  const dotTitle = status ? 'Companion connected' : (statusError ?? (statusLoading ? 'Connecting...' : 'Companion not connected'));
  return (
    <>
      <header className="header">
        <span className="title">
          <span className={`dot ${dotClass}`} title={dotTitle} />
          X3 Inspector
        </span>
        {settings.environments.length > 0 && (
          <select value={activeEnv?.id ?? ''} onChange={(e) => void update({ activeEnvId: e.target.value })} title="Active environment">
            {settings.environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
        {kind && <span className={`pill env-${kind}`}>{kind === 'PROD' ? '🔴 PROD' : kind}</span>}
        <span className="pill readonly">READ ONLY</span>
        <div className="dbinfo">
          {activeEnv ? (
            <>
              <span>Folder {activeEnv.folder || '?'}</span>
              {db ? (
                <span>
                  {db.type === 'mssql' ? 'SQL Server' : 'Oracle'} · {db.database} · schema {db.schema}
                </span>
              ) : (
                <span>{statusLoading ? 'Connecting to companion...' : status ? 'No database (offline metadata)' : 'Companion not connected'}</span>
              )}
            </>
          ) : (
            <span>No environment configured (TOOLS &gt; Settings)</span>
          )}
        </div>
      </header>
      {kind === 'PROD' && <div className="prod-banner">🔴 PROD · READ ONLY</div>}
    </>
  );
}
