import { useNav, type MainTab } from '../state/NavContext';
import { useSettings } from '../state/SettingsContext';

const CLOUD_TABS: readonly MainTab[] = ['CURRENT', 'QUERY', 'OBJECTS', 'CONNECTOR', 'HELP', 'TOOLS'];
const HINTS: Record<MainTab, string> = {
  CURRENT: 'What is open in X3: screen, field under the cursor, current record',
  QUERY: 'Data Export: SOQL-like queries on X3 objects (GraphQL, read only)',
  OBJECTS: 'Object explorer: fields, X3 codes, lookups, stored or calculated',
  CONNECTOR: 'Flowline connector (DHM): parameters, web service tester, logs and index',
  HELP: 'X3 for Salesforce developers, X3 shortcuts, DHM connector memo',
  TOOLS: 'Settings, raw GraphQL, diagnostics, Companion status',
  SQL: 'On-premise only: SQL through the paired Companion',
};

export function MainNav() {
  const { tab, go } = useNav();
  const { client } = useSettings();
  const tabs = client?.hasToken ? [...CLOUD_TABS, 'SQL' as const] : CLOUD_TABS;
  return (
    <nav className="nav">
      {tabs.map((t) => (
        <button key={t} type="button" title={HINTS[t]} className={t === tab ? 'active' : ''} onClick={() => go(t)}>
          {t}
        </button>
      ))}
    </nav>
  );
}
