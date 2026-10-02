/**
 * SYNTHETIC TEST DATA. This is NOT a description of the real Sage X3 dictionary: table and column
 * names follow the hypotheses of the default mapping so that the code paths can be tested.
 * Real structures must come from the probe on a real folder (docs/x3-metadata.md).
 */
import type { CatalogColumn, CatalogIndexColumn, CatalogTable, DictRow } from '../src/metadata/sources';
import { MemoryCatalogSource, MemoryDictSource } from '../src/metadata/memorySources';

const col = (table: string, name: string, ordinal: number, dataType = 'nvarchar', length: number | null = 15): CatalogColumn => ({
  table,
  name,
  ordinal,
  dataType,
  length,
  precision: null,
  scale: null,
  nullable: false,
});

const idx = (table: string, index: string, columns: string[], unique: boolean, primary = false): CatalogIndexColumn[] =>
  columns.map((column, i) => ({ table, index, unique, primary, ordinal: i + 1, column }));

export const tables: CatalogTable[] = [
  { name: 'BPCUSTOMER', rowCount: 120 },
  { name: 'BPARTNER', rowCount: 300 },
  { name: 'SORDER', rowCount: 5000 },
  { name: 'ZSFLINK', rowCount: 10 },
];

export const columns: CatalogColumn[] = [
  col('BPCUSTOMER', 'UPDTICK_0', 1, 'int', null),
  col('BPCUSTOMER', 'BPCNUM_0', 2),
  col('BPCUSTOMER', 'BPCNAM_0', 3, 'nvarchar', 35),
  col('BPCUSTOMER', 'BPCSTA_0', 4, 'tinyint', null),
  col('BPCUSTOMER', 'REP_0', 5),
  col('BPCUSTOMER', 'REP_1', 6),
  col('BPCUSTOMER', 'ZIDSF_OPP_0', 7, 'nvarchar', 18),
  col('BPCUSTOMER', 'ROWID', 8, 'numeric', null),
  col('BPARTNER', 'BPRNUM_0', 1),
  col('BPARTNER', 'BPRNAM_0', 2, 'nvarchar', 35),
  col('SORDER', 'SOHNUM_0', 1),
  col('SORDER', 'BPCORD_0', 2),
  col('SORDER', 'BPRNUM_0', 3),
  col('ZSFLINK', 'BPCNUM_0', 1),
  col('ZSFLINK', 'SFID_0', 2, 'nvarchar', 18),
];

export const indexes: CatalogIndexColumn[] = [
  ...idx('BPCUSTOMER', 'BPCUSTOMER_BPC0', ['BPCNUM_0'], true),
  ...idx('BPCUSTOMER', 'BPCUSTOMER_ROWID', ['ROWID'], true, true),
  ...idx('BPARTNER', 'BPARTNER_BPR0', ['BPRNUM_0'], true),
  ...idx('SORDER', 'SORDER_SOH0', ['SOHNUM_0'], true),
  ...idx('SORDER', 'SORDER_SOH1', ['BPCORD_0'], false),
  ...idx('ZSFLINK', 'ZSFLINK_ZSF0', ['BPCNUM_0', 'SFID_0'], true),
];

const t = (cols: string[], rows: Array<Array<string | number | null>>) => ({
  columns: cols,
  rows: rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? null])) as DictRow),
});

export const dictionary = {
  ATABLE: t(['CODFIC_0', 'ABRFIC_0', 'INTITFIC_0', 'CODACT_0'], [
    ['BPCUSTOMER', 'BPC', '1234', null],
    ['BPARTNER', 'BPR', 'Business partners', null],
    ['SORDER', 'SOH', null, null],
    ['ZSFLINK', 'ZSF', 'Lien Salesforce', 'ZSF'],
  ]),
  ATABZON: t(['CODFIC_0', 'CODZONE_0', 'CODTYP_0', 'LONZONE_0', 'DIME_0', 'INTITZON_0', 'MENLOC_0', 'CODACT_0'], [
    ['BPCUSTOMER', 'BPCNUM', 'BPC', 15, 1, 'Client', 0, null],
    ['BPCUSTOMER', 'BPCNAM', 'A', 35, 1, 'Raison sociale', 0, null],
    ['BPCUSTOMER', 'BPCSTA', 'M', 1, 1, 'Statut', 1, null],
    ['BPCUSTOMER', 'REP', 'REP', 15, 2, 'Représentant', 0, null],
    ['BPCUSTOMER', 'ZIDSF_OPP', 'A', 18, 1, 'Salesforce ID', 0, 'ZSF'],
    ['SORDER', 'BPCORD', 'BPC', 15, 1, 'Client commande', 0, null],
    ['SORDER', 'BPRNUM', 'BPR', 15, 1, 'Tiers', 0, null],
  ]),
  ATYPE: t(['CODTYP_0', 'FICHIER_0'], [
    ['BPC', 'BPCUSTOMER'],
    ['BPR', 'BPARTNER'],
    ['A', null],
  ]),
  APLSTD: t(['LANCHP_0', 'LANNUM_0', 'LAN_0', 'LANMES_0'], [
    [1, 1, 'FRA', 'Non'],
    [1, 2, 'FRA', 'Oui'],
    [1, 2, 'ENG', 'Yes'],
  ]),
  AMSKZON: t(['CODMSK_0', 'CODZONE_0'], [
    ['BPC0', 'BPCNUM'],
    ['BPC1', 'BPCNAM'],
    ['ZBPC', 'ZIDSF_OPP'],
  ]),
  AFONCTION: t(['CODINT_0', 'OBJET_0'], [['GESBPC', 'BPC']]),
  ATEXTRA: t(['CODFIC_0', 'ZONE_0', 'LANGUE_0', 'IDENT1_0', 'IDENT2_0', 'TEXTE_0'], [
    ['ATABLE', 'INTITFIC', 'FRA', 'BPCUSTOMER', '', 'Clients'],
    ['ATABLE', 'INTITFIC', 'ENG', 'BPCUSTOMER', '', 'Customers'],
    ['ATABZON', 'INTITZON', 'FRA', 'BPCUSTOMER', 'BPCNUM', 'Client (traduit)'],
  ]),
};

export function catalogSource(): MemoryCatalogSource {
  return new MemoryCatalogSource(tables, columns, indexes);
}

export function dictSource(): MemoryDictSource {
  return new MemoryDictSource(dictionary);
}
