import type { DictionaryStatus } from '@x3i/shared';
import { useState } from 'react';
import { errorMessage } from '../../../lib/companionClient';
import { clearMetadataCache } from '../../../lib/metadataCache';
import { Button, Card, Collapsible, Message, Spinner } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';

/** Result of the companion dictionary probe: which X3 dictionary blocks are usable. */
export function DictionaryStatusView() {
  const { client, refreshStatus } = useSettings();
  const [status, setStatus] = useState<DictionaryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (refresh: boolean) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      if (refresh) {
        await client.refresh();
        clearMetadataCache();
        refreshStatus();
      }
      setStatus(await client.dictionaryStatus());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card
        title="X3 dictionary status"
        actions={
          <div className="btn-row">
            <Button small variant="primary" disabled={!client || loading} onClick={() => void load(false)}>
              {loading ? <Spinner /> : status ? 'Reload' : 'Load status'}
            </Button>
            <Button small disabled={!client || loading} onClick={() => void load(true)}>
              Refresh metadata
            </Button>
          </div>
        }
      >
        <p className="small muted">
          The dictionary mapping is a hypothesis until verified: the companion checks each table and column in the SQL catalog. Unusable blocks are
          reported as Unknown in the UI. Fix the mapping in the companion config (dictionaryMapping) using the actual columns listed below.
        </p>
        {error && <Message kind="error">{error}</Message>}
        {status && (
          <p className="small muted">
            Provider {status.provider} · probed {new Date(status.probedAt).toLocaleString()} · {status.blocks.filter((b) => b.usable).length}/{status.blocks.length} usable
          </p>
        )}
      </Card>
      {status?.blocks.map((b) => (
        <Card
          key={b.block}
          title={
            <>
              {b.block} <span className="mono muted">{b.table}</span>
            </>
          }
          actions={
            <>
              <span className={`badge ${b.usable ? 'EXACT' : 'UNKNOWN'}`}>{b.usable ? 'USABLE' : 'NOT USABLE'}</span>
              <span className={`badge ${b.status === 'verified' ? 'EXACT' : 'INFERRED'}`}>{b.status.toUpperCase()}</span>
            </>
          }
        >
          {!b.tablePresent && <Message kind="warn">Table {b.table} not found in the schema.</Message>}
          {b.missingRequired.length > 0 && b.tablePresent && <Message kind="warn">Missing required columns: {b.missingRequired.join(', ')}</Message>}
          <div className="info">
            {Object.entries(b.resolved).map(([logical, phys]) => (
              <div key={logical} style={{ display: 'contents' }}>
                <div className="k">{logical}</div>
                <div className="v mono">{phys ?? <span className="unknown">not found</span>}</div>
              </div>
            ))}
          </div>
          {b.tablePresent && (
            <Collapsible summary={`Actual columns (${b.actualColumns.length})`}>
              <pre className="code">{b.actualColumns.join(', ')}</pre>
            </Collapsible>
          )}
        </Card>
      ))}
    </>
  );
}
