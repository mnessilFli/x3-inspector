import { useState } from 'react';
import type { SyracuseDebug } from '../../../content/syracuseState';
import { sendToTopFrame } from '../../../lib/messages';
import { ensureContentScript, getActiveTab } from '../../../lib/tabs';
import { Button, Card, CopyButton, Message } from '../../components/ui';

/** What the page hook captured from Syracuse: windows, screen descriptions (with object / key), last focus. */
export function SyracuseDebugCard() {
  const [data, setData] = useState<SyracuseDebug | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    const tab = await getActiveTab();
    if (tab?.id === undefined || !(await ensureContentScript(tab.id))) {
      setError('The active tab is not a Sage X3 page reachable by X3 Inspector.');
      return;
    }
    setData((await sendToTopFrame<SyracuseDebug | null>(tab.id, { type: 'get-syracuse-debug' })) ?? null);
  };

  const json = data ? JSON.stringify(data, null, 2) : '';
  return (
    <Card
      title="Syracuse capture"
      actions={
        <>
          <Button small onClick={() => void load()}>
            Refresh
          </Button>
          <CopyButton label="Copy JSON" value={json} disabled={!data} />
        </>
      }
    >
      {error && <Message kind="error">{error}</Message>}
      {data === undefined && <p className="small muted">Click Refresh to see what was captured from Syracuse on the active X3 tab.</p>}
      {data === null && <Message kind="warn">No capture: reload the X3 tab (F5) after updating the extension.</Message>}
      {data && (
        <>
          {!data.hookSeen && <Message kind="warn">The page listener sent nothing yet: press F5 on the X3 tab, then open a function.</Message>}
          <div className="info">
            <div className="k">Current window</div>
            <div className="v mono">{data.currentWindow ?? 'none'}</div>
            <div className="k">Last focus</div>
            <div className="v mono">{data.lastFocus ? `${data.lastFocus.win}/${data.lastFocus.xid} = ${data.lastFocus.x3Name ?? '?'}` : 'none'}</div>
          </div>
          <table className="grid" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Window</th>
                <th>Facet</th>
                <th>Object</th>
                <th>Key</th>
                <th>Fields</th>
              </tr>
            </thead>
            <tbody>
              {data.captures.map((c, i) => (
                <tr key={i}>
                  <td className="mono">{c.window}</td>
                  <td className="mono">{c.facet}</td>
                  <td className="mono">{c.object ?? '-'}</td>
                  <td className="mono">{c.keyX3Names.join(', ') || '-'}</td>
                  <td>{c.fields}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
