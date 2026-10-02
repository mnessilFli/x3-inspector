import { describe, expect, it } from 'vitest';
import type { FieldInspection, X3Table } from '@x3i/shared';
import { toCsv } from '../src/export/table';
import { extractCandidates, tokensFromValue } from '../src/page/candidates';
import { resolveInspectedField } from '../src/page/resolveField';
import { applyPageRules, DEFAULT_PAGE_RULES, decodeRepeatedly, validateRule } from '../src/page/rules';
import { screenFieldSyntax, tableFieldSyntax } from '../src/x3/syntax';

describe('page rules', () => {
  // Synthetic URL shaped like the hypothesis in DEFAULT_PAGE_RULES (not captured from a real server).
  const url =
    'http://x3server:8124/syracuse-main/html/main.html?url=%2Ftrans%2Fx3%2Ferp%2FSEED%2F%24sessions%3Ff%3DGESBPC%252F2%252F%252FM%252F%252F';

  it('decodes repeatedly encoded URLs', () => {
    expect(decodeRepeatedly(url)).toContain('/trans/x3/erp/SEED/$sessions?f=GESBPC/2//M//');
    expect(decodeRepeatedly('%E0%A4%A')).toBe('%E0%A4%A'); // invalid encoding left as is
  });

  it('extracts folder and function with the rule that produced them', () => {
    const r = applyPageRules(url, 'Sage X3', DEFAULT_PAGE_RULES);
    expect(r.values.dataset).toEqual({ value: 'SEED', ruleId: 'syracuse-erp-dataset', status: 'verified' });
    expect(r.values.function?.value).toBe('GESBPC');
    expect(r.marksX3?.ruleId).toBe('syracuse-main-path');
    expect(r.signals.length).toBe(3);
  });

  it('matches nothing on an unrelated page', () => {
    const r = applyPageRules('https://example.com/?f=gesbpc', 'Example', DEFAULT_PAGE_RULES);
    expect(r.values).toEqual({});
    expect(r.marksX3).toBeUndefined();
  });

  it('ignores invalid user rules and reports them', () => {
    const bad = { id: 'bad', target: 'url' as const, pattern: '(', status: 'hypothesis' as const, description: '' };
    expect(validateRule(bad)).not.toBeNull();
    expect(applyPageRules(url, '', [bad]).signals).toEqual([]);
  });

  it('reads title rules', () => {
    const rule = { id: 't', target: 'title' as const, pattern: 'Clients \\((?<function>[A-Z]+)\\)', status: 'verified' as const, description: '' };
    expect(applyPageRules('', 'Clients (GESBPC)', [rule]).values.function).toEqual({ value: 'GESBPC', ruleId: 't', status: 'verified' });
  });
});

describe('field candidates', () => {
  it('extracts code-like tokens, with and without the dimension suffix', () => {
    expect(tokensFromValue('s-field BPCNUM_0 x')).toEqual(['BPCNUM_0', 'BPCNUM']);
    expect(tokensFromValue('fld:ZIDSF_OPP')).toEqual(['ZIDSF_OPP']);
    expect(tokensFromValue('lowercase only')).toEqual([]);
  });

  it('ranks closer and more specific attributes first', () => {
    const c = extractCandidates({ tag: 'input', attributes: { id: 'BPCNAM', class: 'x' } }, [
      { tag: 'div', attributes: { 'data-field': 'BPCNUM' } },
      { tag: 'div', attributes: { id: 'BLOC1' } },
    ]);
    expect(c[0]?.name).toBe('BPCNAM');
    expect(c.map((x) => x.name)).toContain('BPCNUM');
    expect(c.find((x) => x.name === 'BLOC1')?.origin).toBe('parent[2]@id');
  });
});

describe('resolveInspectedField', () => {
  const inspection = (names: string[]): FieldInspection => ({
    id: '1',
    inspectedAt: '',
    label: { value: 'Client', prov: { source: 'dom', confidence: 'INFERRED' } },
    displayedValue: { value: 'SFRC000066', prov: { source: 'dom', confidence: 'EXACT' } },
    candidates: names.map((name, i) => ({ name, origin: `element@id${i}`, score: 10 - i })),
    dom: { element: { tag: 'input', attributes: {} }, parents: [], cssPath: 'input', frameUrl: '', isTopFrame: true },
  });
  const table = { name: 'BPCUSTOMER', fields: [{ name: 'BPCNUM' }, { name: 'BPCNAM' }] } as unknown as X3Table;

  it('confirms a candidate against the table (METADATA)', () => {
    const r = resolveInspectedField(inspection(['BLOC1', 'BPCNUM_0']), table);
    expect(r.name).toMatchObject({ value: 'BPCNUM', prov: { confidence: 'METADATA' } });
    expect(r.checked.map((c) => c.found)).toEqual([false, true]);
  });

  it('falls back to the best candidate as INFERRED', () => {
    expect(resolveInspectedField(inspection(['XYZ']), table).name).toMatchObject({ value: 'XYZ', prov: { confidence: 'INFERRED' } });
    expect(resolveInspectedField(inspection(['XYZ']), null).field).toBeNull();
  });

  it('is UNKNOWN without candidates', () => {
    expect(resolveInspectedField(inspection([]), table).name).toMatchObject({ value: null, prov: { confidence: 'UNKNOWN' } });
  });
});

describe('syntax and export', () => {
  it('builds L4G notations', () => {
    expect(tableFieldSyntax('BPC', 'BPCNUM')).toBe('[F:BPC]BPCNUM');
    expect(tableFieldSyntax('BPC', 'REP', 1)).toBe('[F:BPC]REP(1)');
    expect(screenFieldSyntax('BPC0', 'BPCNUM')).toBe('[M:BPC0]BPCNUM');
  });

  it('exports CSV with quoting and optional separator / BOM', () => {
    const rows = [{ A: 'x,y', B: 'say "hi"', C: null }];
    expect(toCsv(['A', 'B', 'C'], rows)).toBe('A,B,C\r\n"x,y","say ""hi""",\r\n');
    expect(toCsv(['A'], [{ A: 'x,y' }], { separator: ';', bom: true })).toBe('﻿A\r\nx,y\r\n');
  });
});
