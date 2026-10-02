import { describe, expect, it } from 'vitest';
import { matchFieldByClues } from '../src/syracuse/matchField';
import { parseFieldPropertiesBox, parsePagesUrl, parsePrototype, parseSessionRequest, parseSessionResponse, parseSessionsUrl, parseX3Name } from '../src/syracuse/protocol';

// Shapes copied from the HAR capture of 2026-10-02 (X3 Cloud, GESBPC); values reduced to what is needed.
const PAGES_URL =
  "https://snouestboissons.em.cloud-by-sage.fr/sdata/syracuse/collaboration/syracuse/pages('x3.erp.PREPROD.OBPC.$fusion,trans,')?role=x&profile=y";

const PROTOTYPE = {
  $prototype: {
    $object: 'BPC',
    $key: '{BPC0_BPCNUM}',
    $properties: {
      AA3: { $type: 'application/x-choice', $X3Name: 'BPC0_BPCSTA', $keyword: 'BPCBPCSTA', $title: '{@F_BPC0_BPCSTA}', $mnu: '1', $X3Fmt: 'LrA1:11X', $maxLength: 18 },
      AA4: { $type: 'application/x-string', $X3Name: 'BPC0_BPCNUM', $keyword: 'BPCNUM', $title: '{@F_BPC0_BPCNUM}', $X3Fmt: 'K:15c', $maxLength: 15 },
      BA3: { $type: 'application/x-string', $X3Name: 'BPRBPC_BPRNAM_1', $title: '{@F_BPRBPC_BPRNAM_1}', $maxLength: 40 },
      BC1: { $type: 'application/x-boolean', $X3Name: 'BPRBPC_BPCFLG', $title: '{@F_BPRBPC_BPCFLG}' },
      CA: { $type: 'application/x-array', $item: { $properties: {} } },
    },
    $localization: {
      '@F_BPC0_BPCSTA': 'Actif',
      '@F_BPC0_BPCNUM': 'Client',
      '@F_BPRBPC_BPRNAM_1': 'Raison sociale 1',
      '@F_BPRBPC_BPCFLG': 'Client',
    },
  },
};

describe('Syracuse protocol parsers', () => {
  it('parses the pages() URL and the sessions URL', () => {
    expect(parsePagesUrl(PAGES_URL)).toEqual({ dataset: 'PREPROD', window: 'OBPC', facet: ',trans,' });
    expect(parsePagesUrl('https://x/sdata/other')).toBeNull();
    expect(parseSessionsUrl("https://x/trans/x3/erp/PREPROD/$sessions('f31c')/requestSvc?act=1044")).toEqual({ dataset: 'PREPROD' });
  });

  it('splits X3 names into screen and field', () => {
    expect(parseX3Name('BPC0_BPCNUM')).toEqual({ screen: 'BPC0', field: 'BPCNUM' });
    expect(parseX3Name('BPRBPC_BPRNAM_1')).toEqual({ screen: 'BPRBPC', field: 'BPRNAM_1' });
    expect(parseX3Name('NOUNDERSCORE')).toEqual({ screen: null, field: null });
  });

  it('builds the window dictionary with labels and local menus', () => {
    const d = parsePrototype(PROTOTYPE, 'PREPROD', 'OBPC');
    expect(Object.keys(d?.fields ?? {})).toEqual(['AA3', 'AA4', 'BA3', 'BC1']); // CA has no $X3Name
    expect(d?.fields.AA4).toMatchObject({ x3Name: 'BPC0_BPCNUM', screen: 'BPC0', field: 'BPCNUM', label: 'Client', maxLength: 15, localMenu: null });
    expect(d?.fields.AA3).toMatchObject({ field: 'BPCSTA', label: 'Actif', localMenu: 1 });
    expect(d).toMatchObject({ object: 'BPC', keyX3Names: ['BPC0_BPCNUM'] });
    expect(parsePrototype({ nope: 1 }, 'P', 'W')).toBeNull();
  });

  it('reads windows, function and focus from a session response', () => {
    const r = parseSessionResponse({ sap: { target: { type: 'ist', ist: { xid: 'AA1', win: 'B' } }, func: { open: { B: { name: 'OBPC', func: 'GESBPC' } } } } });
    expect(r).toEqual({ windows: { B: 'OBPC' }, functionCode: 'GESBPC', focus: { win: 'B', xid: 'AA1' }, box: null });
    expect(parseSessionResponse({})).toBeNull();
  });

  it('reads the field left and the field entered from a requestSvc body', () => {
    const body = '{"act":1044,"fld":{"ist":{"win":"B","xid":"AA1","nl":0},"v":"NOR"},"param":{"target":{"win":"B","xid":"AA4","nl":0}}}';
    expect(parseSessionRequest(body)).toEqual({ act: 1044, left: { win: 'B', xid: 'AA1' }, entered: { win: 'B', xid: 'AA4' } });
    expect(parseSessionRequest('not json')).toBeNull();
  });

  it('reads the Esc + F6 field properties box (capture of 2026-10-02)', () => {
    const resp = {
      sap: { target: { type: 'box', box: { type: 0, def: 1, tit: 'Champ BPCNUM / Ecran BPC0 [BPC0]', li: ['BPCNUM : Client\nType de données : BPN Numéro tiers\nType interne : Alphanumérique\nLongueur : 15\nOption : Format de clé\n'], to: 0 } } },
    };
    const box = parseSessionResponse(resp)?.box;
    expect(box?.lines.length).toBe(5);
    const p = parseFieldPropertiesBox(box!);
    expect(p).toMatchObject({ field: 'BPCNUM', screen: 'BPC0' });
    expect(p.entries[1]).toEqual({ key: 'Type de données', value: 'BPN Numéro tiers' });
    expect(parseSessionRequest('{"act":1172,"fld":{"ist":{"win":"B","xid":"AA4","nl":0},"v":"T107758"},"tech":{}}')).toEqual({ act: 1172, left: { win: 'B', xid: 'AA4' }, entered: null });
  });

  it('matches DOM clues, and reports ambiguity', () => {
    const d = parsePrototype(PROTOTYPE, 'PREPROD', 'OBPC')!;
    expect(matchFieldByClues(d, { label: 'Client', uiType: 'x-string', maxLength: 15 }).map((f) => f.xid)).toEqual(['AA4']);
    expect(matchFieldByClues(d, { label: 'Client', uiType: null, maxLength: null }).map((f) => f.xid)).toEqual(['AA4', 'BC1']);
    expect(matchFieldByClues(d, { label: null, uiType: null, maxLength: null })).toEqual([]);
  });
});
