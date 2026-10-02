import { describe, expect, it } from 'vitest';
import { CatalogMetadataProvider } from '../src/metadata/catalogProvider';
import {
  abbreviationFromIndexCode,
  classifyCustom,
  groupColumns,
  indexCodeFromName,
  inferPrimaryKey,
  objectFromFunction,
  parseColumnName,
} from '../src/metadata/conventions';
import { DEFAULT_DICTIONARY_MAPPING, mergeMapping } from '../src/metadata/dictionary/mapping';
import { probeDictionary, resolveColumn } from '../src/metadata/dictionary/probe';
import { likeToRegExp, MemoryDictSource } from '../src/metadata/memorySources';
import { catalogSource, dictSource } from './fixtures';

const withDict = () => new CatalogMetadataProvider({ name: 'test', catalog: catalogSource(), dict: dictSource(), language: 'FRA' });
const withoutDict = () => new CatalogMetadataProvider({ name: 'test', catalog: catalogSource(), language: 'FRA' });

describe('conventions', () => {
  it('parses dimension suffixes', () => {
    expect(parseColumnName('BPCNUM_0')).toEqual({ field: 'BPCNUM', dimIndex: 0 });
    expect(parseColumnName('ZIDSF_OPP_0')).toEqual({ field: 'ZIDSF_OPP', dimIndex: 0 });
    expect(parseColumnName('ZIDSF_OPP')).toEqual({ field: 'ZIDSF_OPP', dimIndex: null });
    expect(parseColumnName('ROWID')).toEqual({ field: 'ROWID', dimIndex: null });
  });

  it('groups dimensioned columns only when _0 exists', () => {
    const c = (name: string, ordinal: number) => ({ name, dimIndex: parseColumnName(name).dimIndex, ordinal, sqlType: 'x', length: 1, precision: null, scale: null, nullable: false });
    const groups = groupColumns([c('REP_1', 2), c('REP_0', 1), c('CODE_1', 3), c('ROWID', 4)]);
    expect(groups.map((g) => [g.field, g.columns.map((x) => x.name)])).toEqual([
      ['REP', ['REP_0', 'REP_1']],
      ['CODE_1', ['CODE_1']],
      ['ROWID', ['ROWID']],
    ]);
  });

  it('derives index codes and abbreviations', () => {
    expect(indexCodeFromName('BPCUSTOMER', 'BPCUSTOMER_BPC0')).toBe('BPC0');
    expect(indexCodeFromName('BPCUSTOMER', 'OTHER_BPC0')).toBeUndefined();
    expect(abbreviationFromIndexCode('BPC0')).toBe('BPC');
    expect(abbreviationFromIndexCode('BPC')).toBeUndefined();
  });

  it('infers the key from <TABLE>_<ABR>0 and ignores ROWID-only primary keys', () => {
    const key = inferPrimaryKey('BPCUSTOMER', [
      { name: 'BPCUSTOMER_ROWID', unique: true, primary: true, columns: ['ROWID'] },
      { name: 'BPCUSTOMER_BPC10', unique: true, primary: false, columns: ['X_0'] },
      { name: 'BPCUSTOMER_BPC0', unique: true, primary: false, columns: ['BPCNUM_0'] },
    ]);
    expect(key?.columns).toEqual(['BPCNUM_0']);
    expect(key?.abbreviation?.value).toBe('BPC');
    expect(key?.prov.confidence).toBe('INFERRED');
    expect(inferPrimaryKey('T', [{ name: 'T_ROWID', unique: true, primary: true, columns: ['ROWID'] }])).toBeUndefined();
  });

  it('classifies custom names without treating the prefix as a proof', () => {
    expect(classifyCustom('ZIDSF_OPP')).toMatchObject({ level: 'custom-suspected', confidence: 'INFERRED' });
    expect(classifyCustom('BPCNUM')).toMatchObject({ level: 'standard', confidence: 'INFERRED' });
    expect(classifyCustom('BPCNUM', 'ZSF')).toMatchObject({ level: 'custom', confidence: 'METADATA' });
  });

  it('maps GES functions to objects', () => {
    expect(objectFromFunction('GESBPC')).toBe('BPC');
    expect(objectFromFunction('CONSBPC')).toBeUndefined();
  });
});

describe('dictionary probe', () => {
  it('prefers the _0 physical column', () => {
    expect(resolveColumn(['CODFIC'], ['CODFIC', 'CODFIC_0'])).toBe('CODFIC_0');
    expect(resolveColumn(['CODFIC'], ['codfic'])).toBe('codfic');
    expect(resolveColumn(['A', 'B'], ['B_0'])).toBe('B_0');
    expect(resolveColumn(['A'], ['X'])).toBeNull();
  });

  it('reports usable and unusable blocks with the real columns', async () => {
    const { status } = await probeDictionary(DEFAULT_DICTIONARY_MAPPING, dictSource(), 'test');
    const byBlock = Object.fromEntries(status.blocks.map((b) => [b.block, b]));
    expect(byBlock.fields?.usable).toBe(true);
    expect(byBlock.fields?.resolved.order).toBeNull(); // NOLIGNE absent from the synthetic table
    expect(byBlock.objects?.tablePresent).toBe(false);
    expect(byBlock.objects?.usable).toBe(false);
    expect(byBlock.tables?.actualColumns).toContain('ABRFIC_0');
    expect(status.blocks.every((b) => b.status === 'hypothesis')).toBe(true);
  });

  it('disables a block when a required column is missing', async () => {
    const src = new MemoryDictSource({ APLSTD: { columns: ['LANCHP_0', 'LANNUM_0'], rows: [] } });
    const { status } = await probeDictionary(DEFAULT_DICTIONARY_MAPPING, src, 'test');
    const menus = status.blocks.find((b) => b.block === 'localMenus');
    expect(menus?.usable).toBe(false);
    expect(menus?.missingRequired).toEqual(['language', 'label']);
  });

  it('merges overrides', () => {
    const m = mergeMapping(DEFAULT_DICTIONARY_MAPPING, { fields: { columns: { label: ['MYLABEL'] } } });
    expect(m.fields.columns.label).toEqual(['MYLABEL']);
    expect(m.fields.columns.field).toEqual(['CODZONE']);
  });

  it('converts LIKE patterns with "_" kept literal', () => {
    expect(likeToRegExp('%bpcnum_0%').test('XBPCNUM_0Y')).toBe(true);
    expect(likeToRegExp('%BPC_UM%').test('XBPCNUMY')).toBe(false);
    expect(likeToRegExp('A.B').test('AXB')).toBe(false);
  });
});

describe('CatalogMetadataProvider with dictionary', () => {
  it('builds a table from catalog + dictionary with provenance', async () => {
    const t = await withDict().getTable('bpcustomer');
    expect(t?.name).toBe('BPCUSTOMER');
    expect(t?.abbreviation).toMatchObject({ value: 'BPC', prov: { confidence: 'METADATA' } });
    expect(t?.description?.value).toBe('Clients'); // translation preferred over the numeric reference
    expect(t?.primaryKey?.value).toEqual(['BPCNUM_0']);

    const f = Object.fromEntries((t?.fields ?? []).map((x) => [x.name, x]));
    expect(Object.keys(f)).toEqual(['UPDTICK', 'BPCNUM', 'BPCNAM', 'BPCSTA', 'REP', 'ZIDSF_OPP', 'ROWID']);
    expect(f.BPCNUM).toMatchObject({ isKey: true, technical: false, dimension: 1 });
    expect(f.BPCNUM?.label?.value).toBe('Client (traduit)');
    expect(f.BPCNAM?.label?.value).toBe('Raison sociale');
    expect(f.BPCNUM?.linkedTable?.value).toBe('BPCUSTOMER');
    expect(f.REP?.dimension).toBe(2);
    expect(f.BPCSTA?.localMenu?.value).toBe(1);
    expect(f.UPDTICK?.technical).toBe(true);
    expect(f.ZIDSF_OPP?.custom).toMatchObject({ level: 'custom', confidence: 'METADATA' });
    expect(t?.indexes.find((i) => i.name === 'BPCUSTOMER_BPC0')).toMatchObject({ primary: true, fields: ['BPCNUM'] });
  });

  it('returns null for an unknown table', async () => {
    expect(await withDict().getTable('NOPE')).toBeNull();
  });

  it('reads local menus in the environment language', async () => {
    const m = await withDict().getLocalMenu(1);
    expect(m?.values).toEqual([
      { value: 1, label: 'Non' },
      { value: 2, label: 'Oui' },
    ]);
    expect((await withDict().getLocalMenu(1, 'ENG'))?.values).toEqual([{ value: 2, label: 'Yes' }]);
    expect(await withDict().getLocalMenu(999)).toBeNull();
  });

  it('searches tables by name, abbreviation and description', async () => {
    const p = withDict();
    expect((await p.searchTables('BPC'))[0]?.name).toBe('BPCUSTOMER');
    expect((await p.searchTables('client')).map((t) => t.name)).toEqual(['BPCUSTOMER']);
    expect((await p.searchTables('salesforce')).map((t) => t.name)).toEqual(['ZSFLINK']);
  });

  it('finds relations from the dictionary and by inference', async () => {
    const p = withDict();
    const sorder = await p.getRelations('SORDER');
    const toCustomer = sorder.find((r) => r.toTable === 'BPCUSTOMER');
    expect(toCustomer).toMatchObject({ kind: 'dictionary-type-link', direction: 'outgoing', fromColumns: ['BPCORD_0'], toColumns: ['BPCNUM_0'] });
    const toPartner = sorder.filter((r) => r.toTable === 'BPARTNER');
    expect(toPartner).toHaveLength(1); // dictionary and inference agree: deduplicated, dictionary kept
    expect(toPartner[0]?.kind).toBe('dictionary-type-link');

    const customer = await p.getRelations('BPCUSTOMER');
    const incoming = customer.filter((r) => r.direction === 'incoming');
    expect(incoming.map((r) => [r.fromTable, r.kind])).toEqual([
      ['SORDER', 'dictionary-type-link'],
      ['ZSFLINK', 'inferred-key-match'],
    ]);
    expect(incoming[1]?.label).toBe('Inferred - verification required');
  });

  it('runs a universal search', async () => {
    const r = await withDict().search('BPCNUM');
    expect(r.fields.map((f) => `${f.table}.${f.field}`).sort()).toEqual(['BPCUSTOMER.BPCNUM', 'ZSFLINK.BPCNUM']);
    expect(r.screens).toEqual([expect.objectContaining({ screen: 'BPC0', field: 'BPCNUM' })]);
    const byLabel = await withDict().search('raison');
    expect(byLabel.fields).toEqual([expect.objectContaining({ table: 'BPCUSTOMER', field: 'BPCNAM', matchedOn: 'label' })]);
  });

  it('finds where a field is used', async () => {
    const u = await withDict().getFieldUsage('ZIDSF_OPP');
    expect(u.tables.map((t) => t.table)).toEqual(['BPCUSTOMER']);
    expect(u.screens.map((s) => s.screen)).toEqual(['ZBPC']);
  });

  it('resolves the page context through the function dictionary and abbreviations', async () => {
    const r = await withDict().resolvePage({ functionCode: 'GESBPC' });
    expect(r.object).toMatchObject({ value: 'BPC', prov: { confidence: 'METADATA' } });
    expect(r.mainTable).toMatchObject({ value: 'BPCUSTOMER', prov: { confidence: 'METADATA' } });
    expect(r.abbreviation.value).toBe('BPC');
  });
});

describe('CatalogMetadataProvider without dictionary', () => {
  it('falls back to catalog and conventions, and says what is unknown', async () => {
    const t = await withoutDict().getTable('BPCUSTOMER');
    expect(t?.abbreviation).toMatchObject({ value: 'BPC', prov: { confidence: 'INFERRED', source: 'x3-convention' } });
    expect(t?.description).toBeUndefined();
    expect(t?.fields.find((f) => f.name === 'BPCNUM')?.label).toBeUndefined();
    expect(t?.fields.find((f) => f.name === 'ZIDSF_OPP')?.custom.level).toBe('custom-suspected');
    expect(t?.unknowns.join(' ')).toContain('no X3 dictionary source configured');
  });

  it('only infers relations, clearly marked', async () => {
    const rels = await withoutDict().getRelations('SORDER');
    expect(rels.map((r) => [r.toTable, r.kind])).toEqual([['BPARTNER', 'inferred-key-match']]);
  });

  it('resolves the page by convention with INFERRED confidence', async () => {
    const r = await withoutDict().resolvePage({ functionCode: 'GESBPC' });
    expect(r.object.prov.confidence).toBe('INFERRED');
    expect(r.mainTable).toMatchObject({ value: 'BPCUSTOMER', prov: { confidence: 'INFERRED' } });
  });

  it('reports unknown when the function does not follow the convention', async () => {
    const r = await withoutDict().resolvePage({ functionCode: 'CONSBPC' });
    expect(r.object.value).toBeNull();
    expect(r.mainTable.value).toBeNull();
  });

  it('marks search sections that are unavailable', async () => {
    const r = await withoutDict().search('BPC');
    expect(r.unavailable.length).toBeGreaterThan(0);
    expect(r.tables[0]?.name).toBe('BPCUSTOMER');
  });
});
