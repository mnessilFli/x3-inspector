import type { RecordKeyPart } from '@x3i/shared';
import { createContext, useContext, useState, type ReactNode } from 'react';

export type MainTab = 'CURRENT' | 'QUERY' | 'OBJECTS' | 'CONNECTOR' | 'HELP' | 'TOOLS' | 'SQL';

/** SQL is the on-premise toolbox (Companion + database); it is shown only when a Companion is paired. */
export const SUB_TABS = {
  CURRENT: [
    { id: 'screen', label: 'Screen' },
    { id: 'field', label: 'Field' },
    { id: 'record', label: 'Record' },
  ],
  QUERY: [{ id: 'export', label: 'Data Export (GraphQL)' }],
  OBJECTS: [{ id: 'explorer', label: 'Object explorer' }],
  CONNECTOR: [
    { id: 'params', label: 'Parameters' },
    { id: 'ws', label: 'WS tester' },
    { id: 'logs', label: 'Logs & index' },
  ],
  HELP: [
    { id: 'concepts', label: 'X3 for SF devs' },
    { id: 'structure', label: 'X3 structure' },
    { id: 'sql', label: 'SQL & views' },
    { id: 'formulas', label: 'Formulas' },
    { id: 'keys', label: 'Shortcuts' },
    { id: 'dhm', label: 'DHM connector' },
  ],
  TOOLS: [
    { id: 'settings', label: 'Settings' },
    { id: 'graphql', label: 'GraphQL' },
    { id: 'debug', label: 'Debug' },
    { id: 'dictionary', label: 'Companion status' },
  ],
  SQL: [
    { id: 'query', label: 'SQL' },
    { id: 'tables', label: 'Tables' },
    { id: 'record', label: 'Record (SQL)' },
    { id: 'search', label: 'Search' },
    { id: 'fields', label: 'Fields' },
  ],
} as const satisfies Record<MainTab, readonly { id: string; label: string }[]>;

export type SubTab<T extends MainTab> = (typeof SUB_TABS)[T][number]['id'];

/** Cross-feature requests ("open this in..."), consumed by the target view. nonce makes repeats distinct. */
export interface SqlIntent {
  sql: string;
  run: boolean;
  nonce: number;
}
export interface TableIntent {
  table: string;
  nonce: number;
}
export interface RecordIntent {
  table: string;
  key?: RecordKeyPart[];
  run: boolean;
  nonce: number;
}
export interface X3qlIntent {
  query: string;
  run: boolean;
  nonce: number;
}
export interface ObjectIntent {
  node: string;
  nonce: number;
}
export interface FieldIntent {
  field: string;
  table?: string;
  nonce: number;
}

interface NavState {
  tab: MainTab;
  sub: { [K in MainTab]: SubTab<K> };
  go<T extends MainTab>(tab: T, sub?: SubTab<T>): void;
  sqlIntent: SqlIntent | null;
  tableIntent: TableIntent | null;
  recordIntent: RecordIntent | null;
  fieldIntent: FieldIntent | null;
  x3qlIntent: X3qlIntent | null;
  objectIntent: ObjectIntent | null;
  openX3ql(query: string, run?: boolean): void;
  openObject(node: string): void;
  openSql(sql: string, run?: boolean): void;
  openTable(table: string): void;
  openRecord(table: string, key?: RecordKeyPart[], run?: boolean): void;
  openField(field: string, table?: string): void;
}

const Ctx = createContext<NavState | null>(null);
let nonce = 0;

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<MainTab>('CURRENT');
  const [sub, setSub] = useState<NavState['sub']>({ CURRENT: 'screen', QUERY: 'export', OBJECTS: 'explorer', CONNECTOR: 'params', HELP: 'concepts', TOOLS: 'settings', SQL: 'query' });
  const [sqlIntent, setSqlIntent] = useState<SqlIntent | null>(null);
  const [tableIntent, setTableIntent] = useState<TableIntent | null>(null);
  const [recordIntent, setRecordIntent] = useState<RecordIntent | null>(null);
  const [fieldIntent, setFieldIntent] = useState<FieldIntent | null>(null);
  const [x3qlIntent, setX3qlIntent] = useState<X3qlIntent | null>(null);
  const [objectIntent, setObjectIntent] = useState<ObjectIntent | null>(null);

  const go: NavState['go'] = (t, s) => {
    setTab(t);
    if (s) setSub((prev) => ({ ...prev, [t]: s }));
  };

  const value: NavState = {
    tab,
    sub,
    go,
    sqlIntent,
    tableIntent,
    recordIntent,
    fieldIntent,
    x3qlIntent,
    objectIntent,
    openX3ql: (query, run = false) => {
      setX3qlIntent({ query, run, nonce: ++nonce });
      go('QUERY', 'export');
    },
    openObject: (node) => {
      setObjectIntent({ node, nonce: ++nonce });
      go('OBJECTS', 'explorer');
    },
    openSql: (sql, run = false) => {
      setSqlIntent({ sql, run, nonce: ++nonce });
      go('SQL', 'query');
    },
    openTable: (table) => {
      setTableIntent({ table, nonce: ++nonce });
      go('SQL', 'tables');
    },
    openRecord: (table, key, run = false) => {
      setRecordIntent(key ? { table, key, run, nonce: ++nonce } : { table, run, nonce: ++nonce });
      go('SQL', 'record');
    },
    openField: (field, table) => {
      setFieldIntent(table ? { field, table, nonce: ++nonce } : { field, nonce: ++nonce });
      go('SQL', 'fields');
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav(): NavState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav outside NavProvider');
  return v;
}
