import { describe, expect, it } from 'vitest';
import { buildNodeMetaQuery, parseNodeMeta } from '../src/graphql/nodeMeta';
import { validateGraphqlReadOnly } from '../src/graphql/readOnly';

describe('node metadata (xtremMetadata)', () => {
  it('builds a read-only query filtered on the factory name', () => {
    const q = buildNodeMetaQuery('Customer');
    expect(q).toContain('metaNodeFactory { query(first: 1, filter: "{name: \'Customer\'}")');
    expect(validateGraphqlReadOnly(q).ok).toBe(true);
  });

  it('parses stored / required / lookup target', () => {
    const body = {
      data: {
        xtremMetadata: {
          metaNodeFactory: {
            query: {
              edges: [
                {
                  node: {
                    name: 'Customer',
                    title: 'Customer',
                    storage: 'external',
                    properties: {
                      query: {
                        edges: [
                          { node: { name: 'code', title: 'Code', type: 'reference', isStored: true, isRequired: true, isNullable: false, targetFactory: { name: 'BusinessPartner' } } },
                          { node: { name: 'creditLevelTotal', title: 'Credit level total', type: 'decimal', isStored: false, isRequired: false, isNullable: true, targetFactory: null } },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    };
    const m = parseNodeMeta(body)!;
    expect(m.storage).toBe('external');
    expect(m.props.get('code')).toMatchObject({ isStored: true, isRequired: true, target: 'BusinessPartner' });
    expect(m.props.get('creditLevelTotal')).toMatchObject({ isStored: false, target: null });
    expect(parseNodeMeta({ data: { xtremMetadata: { metaNodeFactory: { query: { edges: [] } } } } })).toBeNull();
  });
});
