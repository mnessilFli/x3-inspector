import { describe, expect, it } from 'vitest';
import { baseX3Field, buildReadQuery, buildSchemaIndex, nodeCandidatesForKeyField, readResult, recordRows } from '../src/graphql/schemaIndex';

// Introspection shaped like the X3 Cloud schema export of 2026-10-02, reduced to a few types.
const scalar = (name: string) => ({ kind: 'SCALAR', name, ofType: null });
const object = (name: string) => ({ kind: 'OBJECT', name, ofType: null });
const nonNull = (t: object) => ({ kind: 'NON_NULL', name: null, ofType: t });
const f = (name: string, description: string, type: object) => ({ name, description, type });

const INTRO = {
  data: {
    __schema: {
      queryType: { name: 'Query' },
      types: [
        { kind: 'OBJECT', name: 'Query', fields: [f('x3MasterData', '', object('x3MasterDataQuery'))] },
        {
          kind: 'OBJECT',
          name: 'x3MasterDataQuery',
          fields: [f('customer', 'Customer (Customer)', object('Customer_Operations')), f('customerSalesReps', '', object('CustomerSalesReps_Operations'))],
        },
        { kind: 'OBJECT', name: 'Customer_Operations', fields: [f('read', '', object('Customer')), f('query', '', object('Customer_Connection'))] },
        { kind: 'OBJECT', name: 'CustomerSalesReps_Operations', fields: [f('read', '', object('CustomerSalesReps'))] },
        {
          kind: 'OBJECT',
          name: 'Customer',
          fields: [
            f('_access', '', { kind: 'LIST', name: null, ofType: object('_OutputAccessBinding') }),
            f('_id', 'Id', nonNull(scalar('Id'))),
            f('code', 'Code (BPCNUM)', object('BusinessPartner')),
            f('isActive', 'Is active (BPCSTA)', scalar('Boolean')),
            f('companyName1', 'Company name 1 (BPRNAM)', scalar('String')),
            f('rateType', 'Rate type (CHGTYP)', { kind: 'ENUM', name: 'ExchangeRateType', ofType: null }),
            f('invoiceHeaderText', 'Invoice header text (BPCINVTEX)', object('_OutputTextStream')),
            f('addresses', 'Addresses', object('CustomerAddress_Collection')),
          ],
        },
        { kind: 'OBJECT', name: 'CustomerSalesReps', fields: [f('_id', 'Id', scalar('Id')), f('code', 'Code (BPCNUM)', object('Customer'))] },
        { kind: 'OBJECT', name: 'BusinessPartner', fields: [f('_id', 'Id', scalar('Id'))] },
        { kind: 'OBJECT', name: '_OutputTextStream', fields: [f('value', '', scalar('String'))] },
        { kind: 'OBJECT', name: 'CustomerAddress_Collection', fields: [f('query', '', object('X')), f('readAggregate', '', object('Y'))] },
        { kind: 'OBJECT', name: '_OutputAccessBinding', fields: [f('name', '', scalar('String'))] },
      ],
    },
  },
};

describe('GraphQL schema index', () => {
  const index = buildSchemaIndex(INTRO)!;

  it('indexes readable nodes and property kinds', () => {
    expect(index.nodes.map((n) => `${n.pkg}.${n.node}`)).toEqual(['x3MasterData.customer', 'x3MasterData.customerSalesReps']);
    const kinds = Object.fromEntries(index.nodes[0]!.props.map((p) => [p.name, p.kind]));
    expect(kinds).toEqual({ _id: 'scalar', code: 'reference', isActive: 'scalar', companyName1: 'scalar', rateType: 'enum', invoiceHeaderText: 'text', addresses: 'collection' });
  });

  it('reads the X3 field code from descriptions', () => {
    const code = index.nodes[0]!.props.find((p) => p.name === 'code');
    expect(code).toMatchObject({ x3Field: 'BPCNUM', label: 'Code' });
    expect(index.byX3Field.get('BPCNUM')?.length).toBe(2);
  });

  it('orders node candidates for a key field and strips the occurrence suffix', () => {
    expect(nodeCandidatesForKeyField(index, 'BPCNUM').map((c) => c.node.node)).toEqual(['customer', 'customerSalesReps']);
    expect(baseX3Field('BPRNAM_1')).toBe('BPRNAM');
    expect(nodeCandidatesForKeyField(index, 'BPRNAM_1')[0]?.prop.name).toBe('companyName1');
  });

  it('builds a read query without collections and flattens the answer', () => {
    const node = index.nodes[0]!;
    expect(buildReadQuery(node, 'T107758')).toBe(
      '{ x3MasterData { customer { read(_id: "T107758") { _id code { _id } isActive companyName1 rateType invoiceHeaderText { value } } } } }',
    );
    const body = { data: { x3MasterData: { customer: { read: { _id: 'T107758', code: { _id: 'T107758' }, isActive: true, companyName1: 'CLIENT TEST', rateType: 'dailyRate', invoiceHeaderText: null } } } } };
    const rows = recordRows(node, readResult(node, body)!);
    expect(rows.find((r) => r.prop === 'code')).toMatchObject({ x3Field: 'BPCNUM', value: 'T107758' });
    expect(rows.find((r) => r.prop === 'isActive')?.value).toBe('true');
    expect(rows.find((r) => r.prop === 'addresses')?.kind).toBe('collection');
    expect(readResult(node, { data: { x3MasterData: { customer: { read: null } } } })).toBeNull();
  });

  it('refuses something that is not an introspection result', () => {
    expect(buildSchemaIndex({ data: {} })).toBeNull();
  });
});
