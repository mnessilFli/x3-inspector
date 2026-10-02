import { describe, expect, it } from 'vitest';
import { buildSchemaIndex } from '../src/graphql/schemaIndex';
import { likeToRegex, parseX3ql, x3Literal, x3qlRows } from '../src/graphql/x3ql';
import { nodeKeyField, x3qlHover, x3qlSuggestions } from '../src/graphql/x3qlAssist';

// Introspection shaped like the X3 Cloud schema export of 2026-10-02, reduced.
const scalar = (name: string) => ({ kind: 'SCALAR', name, ofType: null });
const object = (name: string) => ({ kind: 'OBJECT', name, ofType: null });
const f = (name: string, description: string, type: object) => ({ name, description, type });
const ops = (name: string, read: string) => ({ kind: 'OBJECT', name, fields: [f('read', '', object(read)), f('query', '', object(`${read}_Query`))] });

const INDEX = buildSchemaIndex({
  data: {
    __schema: {
      queryType: { name: 'Query' },
      types: [
        { kind: 'OBJECT', name: 'Query', fields: [f('x3MasterData', '', object('MD'))] },
        { kind: 'OBJECT', name: 'MD', fields: [f('customer', '', object('CustOps')), f('customerCategory', '', object('CatOps')), f('businessPartner', '', object('BpOps'))] },
        ops('CustOps', 'Customer'),
        ops('CatOps', 'CustomerCategory'),
        ops('BpOps', 'BusinessPartner'),
        {
          kind: 'OBJECT',
          name: 'Customer',
          fields: [
            f('_id', 'Id', scalar('Id')),
            f('code', 'Code (BPCNUM)', object('BusinessPartner')),
            f('customerCategory', 'Customer category (BCGCOD)', object('CustomerCategory')),
            f('isActive', 'Is active (BPCSTA)', scalar('Boolean')),
            f('companyName1', 'Company name 1 (BPRNAM)', scalar('String')),
            f('authorizedCreditAmount', 'Authorized credit amount (OSTAUZ)', scalar('Decimal')),
            f('creditLevelTotal', 'Credit level total', scalar('Decimal')),
            f('notes', 'Notes (BPCREM)', object('_OutputTextStream')),
            f('addresses', 'Addresses', object('Addr_Collection')),
          ],
        },
        { kind: 'OBJECT', name: 'CustomerCategory', fields: [f('_id', 'Id', scalar('Id')), f('code', 'Code (BCGCOD)', scalar('String')), f('description', 'Description (BCGDES)', scalar('String'))] },
        { kind: 'OBJECT', name: 'BusinessPartner', fields: [f('_id', 'Id', scalar('Id')), f('code', 'Code (BPRNUM)', scalar('String'))] },
        { kind: 'OBJECT', name: '_OutputTextStream', fields: [f('value', '', scalar('String'))] },
        { kind: 'OBJECT', name: 'Addr_Collection', fields: [f('query', '', object('X'))] },
      ],
    },
  },
})!;

describe('X3QL -> GraphQL', () => {
  it('translates a simple query with documented operators', () => {
    const r = parseX3ql("SELECT code, companyName1 FROM customer WHERE isActive = true AND authorizedCreditAmount >= 100 AND companyName1 LIKE 'KAO%' ORDER BY companyName1 DESC LIMIT 50", INDEX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.filter).toBe("{isActive: true, authorizedCreditAmount: {_gte: 100}, companyName1: {_regex: '^KAO.*$'}}");
    expect(r.query.orderBy).toBe('{companyName1: -1}');
    expect(r.query.graphql).toBe(
      '{ x3MasterData { customer { query(first: 50, filter: "{isActive: true, authorizedCreditAmount: {_gte: 100}, companyName1: {_regex: \'^KAO.*$\'}}", orderBy: "{companyName1: -1}") { totalCount edges { node { _id code { _id } companyName1 } } } } } }',
    );
    expect(r.query.columns.map((c) => c.name)).toEqual(['code', 'companyName1']);
  });

  it('follows references (relationship fields like SOQL) and filters on them', () => {
    const r = parseX3ql("select customerCategory.description, notes from Customer where customerCategory.code = 'NOR' and _id = 'T107758'", INDEX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.query.graphql).toContain('customerCategory { description } notes { value }');
    expect(r.query.filter).toBe("{customerCategory: {code: 'NOR'}, _id: 'T107758'}");
    expect(r.query.limit).toBe(100);
  });

  it('expands * to the readable properties', () => {
    const r = parseX3ql('SELECT * FROM customer LIMIT 5000', INDEX);
    expect(r.ok && r.query.columns.map((c) => c.name)).toEqual(['_id', 'code', 'customerCategory', 'isActive', 'companyName1', 'authorizedCreditAmount', 'creditLevelTotal', 'notes']);
    expect(r.ok && r.query.limit).toBe(1000);
  });

  it('explains what is not supported instead of guessing', () => {
    const msg = (q: string) => {
      const r = parseX3ql(q, INDEX);
      return r.ok ? '' : r.errors.map((e) => e.message).join(' | ');
    };
    expect(msg('SELECT code FROM nope')).toContain('Unknown GraphQL object');
    expect(msg('SELECT nope FROM customer')).toContain('no property "nope"');
    expect(msg("SELECT code FROM customer WHERE code = 'X'")).toContain('is a reference');
    expect(msg('SELECT code FROM customer WHERE isActive != true')).toContain('not supported');
    expect(msg('SELECT code FROM customer WHERE isActive = true OR isActive = false')).toContain('OR is not supported');
    expect(msg('SELECT addresses FROM customer')).toContain('sub-collections');
    expect(msg('DELETE FROM customer')).toContain('start with SELECT');
  });

  it('escapes literals and converts LIKE patterns', () => {
    expect(x3Literal({ a: "O'Neil", b: { _lte: 3 } })).toBe("{a: 'O\\'Neil', b: {_lte: 3}}");
    expect(likeToRegex('A.B%_')).toBe('^A\\.B.*.$');
  });

  it('flattens the answer into rows', () => {
    const r = parseX3ql('SELECT code, customerCategory.description, notes FROM customer', INDEX);
    if (!r.ok) throw new Error('parse');
    const body = { data: { x3MasterData: { customer: { query: { totalCount: 1, edges: [{ node: { _id: 'T1', code: { _id: 'T1' }, customerCategory: { description: 'B2B' }, notes: { value: 'x' } } }] } } } } };
    expect(x3qlRows(r.query, body)).toEqual({ totalCount: 1, rows: [{ code: 'T1', 'customerCategory.description': 'B2B', notes: 'x' }] });
  });
});

describe('X3QL assistance', () => {
  const at = (s: string) => ({ text: s.replace('|', ''), pos: s.indexOf('|') });

  it('suggests objects after FROM, including by key X3 field', () => {
    const { text, pos } = at('SELECT code FROM cust|');
    const s = x3qlSuggestions(text, pos, INDEX);
    expect(s.kind).toBe('objects');
    expect(s.items.map((i) => i.insert)).toEqual(['customer', 'customerCategory']);
    const byCode = x3qlSuggestions('SELECT code FROM BPCNUM', 23, INDEX);
    expect(byCode.items.map((i) => i.insert)).toEqual(['customer']);
    expect(nodeKeyField(INDEX.nodes[0]!)).toBe('BPCNUM');
  });

  it('suggests fields of the FROM object by name, X3 code or label', () => {
    const { text, pos } = at('SELECT BPRN| FROM customer');
    expect(x3qlSuggestions(text, pos, INDEX).items.map((i) => i.insert)).toEqual(['companyName1']);
    const all = at('SELECT | FROM customer');
    const s = x3qlSuggestions(all.text, all.pos, INDEX);
    expect(s.kind).toBe('fields');
    expect(s.items.find((i) => i.insert === 'code')?.detail).toBe('X3: BPCNUM · Code · -> businessPartner');
    expect(s.items.some((i) => i.insert === 'addresses')).toBe(false);
  });

  it('suggests fields of a referenced object after "reference."', () => {
    const { text, pos } = at('SELECT customerCategory.| FROM customer');
    expect(x3qlSuggestions(text, pos, INDEX).items.map((i) => i.insert)).toEqual(['_id', 'code', 'description']);
  });

  it('suggests SQL keywords according to the position and the letters typed', () => {
    const kw = (s: string) => {
      const { text, pos } = at(s);
      return x3qlSuggestions(text, pos, INDEX).keywords.map((k) => k.label);
    };
    expect(kw('|')).toEqual(['SELECT']);
    expect(kw('SEL|')).toEqual(['SELECT']);
    expect(kw('SELECT code |')).toEqual(['FROM']);
    expect(kw('SELECT code FROM customer |')).toEqual(['WHERE', 'ORDER BY', 'LIMIT']);
    expect(kw('SELECT code FROM customer WHERE isActive = true |')).toEqual(['AND', 'LIKE', 'TRUE', 'FALSE', 'ORDER BY', 'LIMIT']);
    expect(kw('SELECT code FROM customer O|')).toEqual(['ORDER BY']);
    expect(kw('SELECT code FROM customer ORDER BY code |')).toEqual(['ASC', 'DESC', 'LIMIT']);
  });

  it('explains a field on hover', () => {
    const text = 'SELECT creditLevelTotal FROM customer';
    expect(x3qlHover(text, 10, INDEX)).toEqual({ title: 'customer.creditLevelTotal', detail: 'Credit level total · Decimal' });
    expect(x3qlHover(text, 33, INDEX)?.title).toBe('x3MasterData.customer');
  });
});

describe('X3QL assistance after LIMIT', () => {
  it('suggests nothing after LIMIT', () => {
    const s = x3qlSuggestions('SELECT code FROM customer LIMIT ', 32, INDEX);
    expect(s.items).toEqual([]);
    expect(s.keywords).toEqual([]);
  });
});
