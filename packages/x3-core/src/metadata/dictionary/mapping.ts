import type { DictionaryBlockName } from '@x3i/shared';

export interface DictBlockMapping {
  table: string;
  /** Logical column -> physical candidates (tried with and without the _0 suffix). */
  columns: Record<string, string[]>;
  required: string[];
  /** Logical columns identifying a row, used as IDENT1/IDENT2 for translations. */
  keyColumns: string[];
  /** Logical column holding a translatable text, if any. */
  textColumn?: string;
  status: 'hypothesis' | 'verified';
  note: string;
}

export type DictionaryMapping = Record<DictionaryBlockName, DictBlockMapping>;

export type DictBlockOverride = Partial<Omit<DictBlockMapping, 'columns'>> & { columns?: Record<string, string[]> };
export type DictionaryMappingOverride = Partial<Record<DictionaryBlockName, DictBlockOverride>>;

/**
 * DEFAULT MAPPING: EVERY ENTRY IS A HYPOTHESIS.
 * Source: general X3 knowledge and the candidate list of the x3-connect skill. Nothing here was
 * verified on a real X3 V12 folder. The probe checks each table and column in the SQL catalog
 * before use; unresolved blocks are disabled and reported as Unknown.
 * Once validated on a real environment, set status: 'verified' and document version + date
 * in docs/x3-metadata.md.
 */
export const DEFAULT_DICTIONARY_MAPPING: DictionaryMapping = {
  tables: {
    table: 'ATABLE',
    columns: { table: ['CODFIC'], abbreviation: ['ABRFIC'], description: ['INTITFIC'], activity: ['CODACT'], module: ['MODULE'] },
    required: ['table'],
    keyColumns: ['table'],
    textColumn: 'description',
    status: 'hypothesis',
    note: 'Table dictionary. INTITFIC may be a direct text or a translation reference.',
  },
  fields: {
    table: 'ATABZON',
    columns: {
      table: ['CODFIC'],
      field: ['CODZONE'],
      x3Type: ['CODTYP'],
      length: ['LONZONE'],
      dimension: ['DIME'],
      label: ['INTITZON'],
      localMenu: ['MENLOC'],
      activity: ['CODACT'],
      order: ['NOLIGNE'],
    },
    required: ['table', 'field'],
    keyColumns: ['table', 'field'],
    textColumn: 'label',
    status: 'hypothesis',
    note: 'Table fields. Local menu and label columns are the least certain.',
  },
  indexes: {
    table: 'ATABIND',
    columns: { table: ['CODFIC'], code: ['CODIND'], description: ['DESCRIPT'], duplicates: ['HOMONYM'] },
    required: ['table', 'code'],
    keyColumns: ['table', 'code'],
    status: 'hypothesis',
    note: 'Index dictionary. Key formula location to confirm.',
  },
  types: {
    table: 'ATYPE',
    columns: { type: ['CODTYP'], linkedTable: ['FICHIER'], length: ['LONG', 'LONGUEUR'] },
    required: ['type', 'linkedTable'],
    keyColumns: ['type'],
    status: 'hypothesis',
    note: 'Data types. linkedTable drives dictionary relations (field type -> table).',
  },
  localMenus: {
    table: 'APLSTD',
    columns: { menu: ['LANCHP'], value: ['LANNUM'], language: ['LAN'], label: ['LANMES'] },
    required: ['menu', 'value', 'language', 'label'],
    keyColumns: ['menu', 'value'],
    status: 'hypothesis',
    note: 'Local menu values per language.',
  },
  screens: {
    table: 'AMASK',
    columns: { screen: ['CODMSK'], abbreviation: ['ABRMSK'] },
    required: ['screen'],
    keyColumns: ['screen'],
    status: 'hypothesis',
    note: 'Screens (masks).',
  },
  screenFields: {
    table: 'AMSKZON',
    columns: { screen: ['CODMSK'], field: ['CODZONE'] },
    required: ['screen', 'field'],
    keyColumns: ['screen', 'field'],
    status: 'hypothesis',
    note: 'Fields of screens.',
  },
  objects: {
    table: 'AOBJET',
    columns: { object: ['CODOBJ', 'OBJET'], mainTable: ['NOMFIC', 'FICHIER'], window: ['FENETRE'] },
    required: ['object'],
    keyColumns: ['object'],
    status: 'hypothesis',
    note: 'Objects. mainTable resolves function -> table for the Record Inspector.',
  },
  functions: {
    table: 'AFONCTION',
    columns: { function: ['CODINT'], object: ['OBJET'] },
    required: ['function'],
    keyColumns: ['function'],
    status: 'hypothesis',
    note: 'Functions.',
  },
  windows: {
    table: 'AWINDOW',
    columns: { window: ['CODWIN', 'FENETRE'] },
    required: ['window'],
    keyColumns: ['window'],
    status: 'hypothesis',
    note: 'Windows.',
  },
  translations: {
    table: 'ATEXTRA',
    columns: { dictTable: ['CODFIC'], zone: ['ZONE'], language: ['LANGUE'], ident1: ['IDENT1'], ident2: ['IDENT2'], text: ['TEXTE'] },
    required: ['dictTable', 'zone', 'language', 'ident1', 'text'],
    keyColumns: [],
    status: 'hypothesis',
    note: 'Translatable texts (labels and descriptions per language).',
  },
};

export function mergeMapping(base: DictionaryMapping, override: DictionaryMappingOverride | undefined): DictionaryMapping {
  if (!override) return base;
  const out = { ...base } as DictionaryMapping;
  for (const [block, ov] of Object.entries(override) as Array<[keyof DictionaryMapping, DictBlockOverride | undefined]>) {
    if (!ov) continue;
    const b = base[block];
    out[block] = {
      ...b,
      ...ov,
      columns: { ...b.columns, ...(ov.columns ?? {}) },
      required: ov.required ?? b.required,
      keyColumns: ov.keyColumns ?? b.keyColumns,
    };
  }
  return out;
}
