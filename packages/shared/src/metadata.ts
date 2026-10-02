import type { Attr, Confidence, Provenance } from './provenance';

export type CustomLevel = 'standard' | 'custom-suspected' | 'custom';

export interface CustomFlag {
  level: CustomLevel;
  confidence: Confidence;
  reason: string;
}

export interface X3TableSummary {
  /** Physical table name as found in the SQL catalog (EXACT). */
  name: string;
  abbreviation?: Attr<string>;
  description?: Attr<string>;
  rowCount: number | null;
  custom: CustomFlag;
}

export interface X3PhysicalColumn {
  name: string;
  /** Dimension index parsed from the FIELD_<n> suffix, null when the column has no suffix. */
  dimIndex: number | null;
  ordinal: number;
  sqlType: string;
  length: number | null;
  precision: number | null;
  scale: number | null;
  nullable: boolean;
}

export interface X3Field {
  /** Logical X3 field name (BPCNUM), derived from physical columns (BPCNUM_0). */
  name: string;
  table: string;
  columns: X3PhysicalColumn[];
  dimension: number;
  /** Technical column (UPDTICK, AUUID, ROWID...). */
  technical: boolean;
  /** Part of the primary key (as determined, see X3Table.primaryKey provenance). */
  isKey: boolean;
  sqlType: string;
  length: number | null;
  label?: Attr<string>;
  x3Type?: Attr<string>;
  x3Length?: Attr<number>;
  localMenu?: Attr<number>;
  linkedTable?: Attr<string>;
  activityCode?: Attr<string>;
  custom: CustomFlag;
  prov: Provenance;
}

export interface X3Index {
  name: string;
  /** X3 index code (BPC0) when it can be derived. */
  code?: Attr<string>;
  unique: boolean;
  primary: boolean;
  columns: string[];
  /** Logical fields (columns without the _<n> suffix). */
  fields: string[];
  prov: Provenance;
}

export interface X3Table extends X3TableSummary {
  module?: Attr<string>;
  activityCode?: Attr<string>;
  fields: X3Field[];
  indexes: X3Index[];
  /** Physical columns of the primary key. */
  primaryKey?: Attr<string[]>;
  /** Information that could not be determined, with the reason. */
  unknowns: string[];
}

export type RelationKind = 'dictionary-type-link' | 'inferred-key-match' | 'knowledge-base';

export interface X3Relation {
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  kind: RelationKind;
  /** e.g. "X3 dictionary (type BPC -> BPCUSTOMER)" or "Inferred - verification required". */
  label: string;
  /** outgoing: fromTable is the inspected table. incoming: toTable is the inspected table. */
  direction: 'outgoing' | 'incoming';
  prov: Provenance;
}

export interface X3LocalMenuValue {
  value: number;
  label: string;
}

export interface X3LocalMenu {
  menu: number;
  language: string;
  values: X3LocalMenuValue[];
  prov: Provenance;
}

export interface X3FieldHit {
  table: string;
  field: string;
  label?: Attr<string>;
  columns: string[];
  custom: CustomFlag;
  matchedOn: 'name' | 'label';
}

export interface X3ScreenFieldHit {
  screen: string;
  field: string;
  prov: Provenance;
}

export interface X3FunctionHit {
  code: string;
  object?: string;
  prov: Provenance;
}

export interface X3SearchResult {
  query: string;
  tables: X3TableSummary[];
  fields: X3FieldHit[];
  screens: X3ScreenFieldHit[];
  functions: X3FunctionHit[];
  /** Sections that could not be searched, with the reason. */
  unavailable: string[];
}

export interface X3FieldUsage {
  field: string;
  tables: X3FieldHit[];
  screens: X3ScreenFieldHit[];
  unavailable: string[];
}

export interface X3ObjectInfo {
  code: string;
  mainTable?: Attr<string>;
  window?: Attr<string>;
  prov: Provenance;
}

export type DictionaryBlockName =
  | 'tables'
  | 'fields'
  | 'indexes'
  | 'types'
  | 'localMenus'
  | 'screens'
  | 'screenFields'
  | 'objects'
  | 'functions'
  | 'windows'
  | 'translations';

export interface DictionaryBlockStatus {
  block: DictionaryBlockName;
  table: string;
  tablePresent: boolean;
  /** Logical column -> resolved physical column (null when no candidate exists). */
  resolved: Record<string, string | null>;
  missingRequired: string[];
  usable: boolean;
  status: 'hypothesis' | 'verified';
  /** Real columns of the candidate table, to help fixing the mapping. */
  actualColumns: string[];
}

export interface DictionaryStatus {
  provider: string;
  probedAt: string;
  blocks: DictionaryBlockStatus[];
}
