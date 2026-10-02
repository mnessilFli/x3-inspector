import { useState } from 'react';
import { hasHostPermission, matchPatternOf, requestHostPermission } from '../../../lib/env';
import { Button, Message } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { usePage } from '../../state/PageContext';
import { useSettings } from '../../state/SettingsContext';

/** Shown when the content script cannot run in the active tab. */
export function AccessHelp() {
  const { activeEnv } = useSettings();
  const { inspectScreen } = usePage();
  const nav = useNav();
  const [msg, setMsg] = useState<string | null>(null);
  const pattern = activeEnv?.x3Url ? matchPatternOf(activeEnv.x3Url) : undefined;

  return (
    <Message kind="warn">
      X3 Inspector cannot read this tab. Either it is not a Sage X3 page, or access to the site was not granted.
      <ul>
        <li>Configure the X3 URL of this site in an environment (TOOLS &gt; Settings).</li>
        <li>Grant access to that site, then inspect again.</li>
      </ul>
      <div className="btn-row" style={{ marginTop: 6 }}>
        {pattern && activeEnv ? (
          <Button
            variant="primary"
            small
            onClick={async () => {
              const ok = (await hasHostPermission(activeEnv.x3Url)) || (await requestHostPermission(activeEnv.x3Url));
              setMsg(ok ? `Access granted to ${pattern}` : 'Access refused');
              if (ok) await inspectScreen();
            }}
          >
            Grant access to {pattern}
          </Button>
        ) : (
          <Button small onClick={() => nav.go('TOOLS', 'settings')}>
            Configure an environment
          </Button>
        )}
      </div>
      {msg && <div className="small" style={{ marginTop: 4 }}>{msg}</div>}
    </Message>
  );
}
