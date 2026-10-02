import { describe, expect, it } from 'vitest';
import { detectIndexNode, detectLogNode, indexQuery, logQuery, CONNECTOR_SQL } from '../src/connector/connectorNodes';
import { buildSchemaIndex } from '../src/graphql/schemaIndex';
import { parseX3ql } from '../src/graphql/x3ql';

// Synthetic schema: node names are free, detection relies on the X3 codes in descriptions.
const s = (name: string) => ({ kind: 'SCALAR', name, ofType: null });
const o = (name: string) => ({ kind: 'OBJECT', name, ofType: null });
const f = (name: string, description: string, type: object) => ({ name, description, type });
const INDEX = buildSchemaIndex({ data: { __schema: { queryType: { name: 'Q' }, types: [
  { kind: 'OBJECT', name: 'Q', fields: [f('xyzConnector', '', o('Pk'))] },
  { kind: 'OBJECT', name: 'Pk', fields: [f('sfIndex', '', o('IdxOps')), f('apiLog', '', o('LogOps'))] },
  { kind: 'OBJECT', name: 'IdxOps', fields: [f('read', '', o('SfIndex')), f('query', '', o('X'))] },
  { kind: 'OBJECT', name: 'LogOps', fields: [f('read', '', o('ApiLog')), f('query', '', o('X'))] },
  { kind: 'OBJECT', name: 'SfIndex', fields: [f('_id', 'Id', s('Id')), f('table', 'Code table (CODFIC)', s('String')), f('key', 'Clé (CLE)', s('String')), f('salesforceId', 'Numéro ID distant (NUMIDD)', s('String'))] },
  { kind: 'OBJECT', name: 'ApiLog', fields: [f('_id', 'Id', s('Id')), f('counter', 'Compteur (YCOMPT)', s('String')), f('webService', 'Nom WS (YNAMWS)', s('String')), f('flow', 'Flux (YFLUX)', s('String')), f('date', 'Date (YDATE)', s('Date')), f('time', 'Heure (YHEURE)', s('String')), f('status', 'Etat (YSTA)', s('String')), f('key1', 'Clef1 (YCLEF1)', s('String'))] },
] } } })!;

describe('connector nodes detection', () => {
  it('finds the index and log nodes from X3 codes, whatever their names', () => {
    expect(detectIndexNode(INDEX)?.node.node).toBe('sfIndex');
    expect(detectLogNode(INDEX)?.paths).toMatchObject({ YCOMPT: 'counter', YDATE: 'date', YHEURE: 'time' });
  });

  it('builds valid X3QL searches', () => {
    const idx = detectIndexNode(INDEX)!;
    const q1 = indexQuery(idx, { salesforceId: "001AB'C", table: 'bpcustomer' });
    expect(q1).toBe("SELECT * FROM sfIndex WHERE salesforceId = '001AB''C' AND table = 'BPCUSTOMER' LIMIT 50");
    expect(parseX3ql(q1, INDEX).ok).toBe(true);
    const q2 = logQuery(detectLogNode(INDEX)!, { flow: 'BPC_SF', key1: 'T107758' });
    expect(q2).toBe("SELECT * FROM apiLog WHERE flow = 'BPC_SF' AND key1 LIKE 'T107758%' ORDER BY date DESC, time DESC LIMIT 50");
    expect(parseX3ql(q2, INDEX).ok).toBe(true);
  });

  it('returns null when the tables are not published', () => {
    const empty = buildSchemaIndex({ data: { __schema: { queryType: { name: 'Q' }, types: [{ kind: 'OBJECT', name: 'Q', fields: [] }] } } })!;
    expect(detectIndexNode(empty)).toBeNull();
    expect(CONNECTOR_SQL.indexBySalesforceId('001')).toBe("SELECT * FROM YINDEXAPI WHERE NUMIDD_0 = '001'");
  });
});
