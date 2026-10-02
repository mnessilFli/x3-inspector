import { useEffect, type ReactNode } from 'react';
import { SubTabs } from './components/ui';
import { FieldView } from './features/current/FieldView';
import { ScreenView } from './features/current/ScreenView';
import { RecordInspector } from './features/data/RecordInspector';
import { TableExplorer } from './features/data/TableExplorer';
import { FieldExplorer } from './features/metadata/FieldExplorer';
import { SearchView } from './features/metadata/SearchView';
import { SqlView } from './features/sql/SqlView';
import { DictionaryStatusView } from './features/tools/DictionaryStatusView';
import { DomDebugView } from './features/tools/DomDebugView';
import { GraphqlView } from './features/tools/GraphqlView';
import { GraphqlRecordView } from './features/current/GraphqlRecordView';
import { SettingsView } from './features/tools/SettingsView';
import { X3qlView } from './features/query/X3qlView';
import { ParamsView } from './features/connector/ParamsView';
import { WsTesterView } from './features/connector/WsTesterView';
import { LogsIndexView } from './features/connector/LogsIndexView';
import { ObjectExplorer } from './features/objects/ObjectExplorer';
import { HelpView, type HelpSection } from './features/help/HelpView';
import { Header } from './layout/Header';
import { MainNav } from './layout/MainNav';
import { NavProvider, SUB_TABS, useNav } from './state/NavContext';
import { PageProvider, usePage } from './state/PageContext';
import { SettingsProvider } from './state/SettingsContext';

export function App() {
  return (
    <SettingsProvider>
      <PageProvider>
        <NavProvider>
          <Shell />
        </NavProvider>
      </PageProvider>
    </SettingsProvider>
  );
}

function Shell() {
  const nav = useNav();
  const { inspection } = usePage();
  const tab = nav.tab;

  // a field clicked in X3 is shown right away, whatever the current tab
  useEffect(() => {
    if (inspection && !inspection.auto) nav.go('CURRENT', 'field');
    // only on new inspections
  }, [inspection?.id]);

  const sub = nav.sub[tab];
  return (
    <>
      <Header />
      <MainNav />
      <SubTabs tabs={SUB_TABS[tab]} value={sub} onChange={(s) => nav.go(tab, s as never)} />
      <main className="content">
        {/* Views stay mounted so work in progress (SQL, record) survives tab switches. */}
        <View show={tab === 'CURRENT' && sub === 'screen'}>
          <ScreenView />
        </View>
        <View show={tab === 'CURRENT' && sub === 'field'}>
          <FieldView />
        </View>
        <View show={tab === 'CURRENT' && sub === 'record'}>
          <GraphqlRecordView />
        </View>
        <View show={tab === 'QUERY'}>
          <X3qlView />
        </View>
        <View show={tab === 'OBJECTS'}>
          <ObjectExplorer />
        </View>
        <View show={tab === 'CONNECTOR' && sub === 'params'}>
          <ParamsView />
        </View>
        <View show={tab === 'CONNECTOR' && sub === 'ws'}>
          <WsTesterView />
        </View>
        <View show={tab === 'CONNECTOR' && sub === 'logs'}>
          <LogsIndexView />
        </View>
        <View show={tab === 'HELP'}>
          <HelpView section={tab === 'HELP' ? (sub as HelpSection) : 'concepts'} />
        </View>
        <View show={tab === 'SQL' && sub === 'tables'}>
          <TableExplorer />
        </View>
        <View show={tab === 'SQL' && sub === 'record'}>
          <RecordInspector />
        </View>
        <View show={tab === 'SQL' && sub === 'query'}>
          <SqlView />
        </View>
        <View show={tab === 'SQL' && sub === 'search'}>
          <SearchView />
        </View>
        <View show={tab === 'SQL' && sub === 'fields'}>
          <FieldExplorer />
        </View>
        <View show={tab === 'TOOLS' && sub === 'settings'}>
          <SettingsView />
        </View>
        <View show={tab === 'TOOLS' && sub === 'debug'}>
          <DomDebugView />
        </View>
        <View show={tab === 'TOOLS' && sub === 'graphql'}>
          <GraphqlView />
        </View>
        <View show={tab === 'TOOLS' && sub === 'dictionary'}>
          <DictionaryStatusView />
        </View>
      </main>
    </>
  );
}

function View({ show, children }: { show: boolean; children: ReactNode }) {
  return <div style={{ display: show ? 'contents' : 'none' }}>{children}</div>;
}

