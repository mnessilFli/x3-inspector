import { describe, expect, it } from 'vitest';
import { validateGraphqlReadOnly } from '../src/graphql/readOnly';
import { INTROSPECTION_QUERY } from '../src/graphql/introspection';

describe('validateGraphqlReadOnly', () => {
  it('accepts queries, including the introspection query', () => {
    expect(validateGraphqlReadOnly('{ x3MasterData { businessPartner { query(first: 1) { totalCount } } } }').ok).toBe(true);
    expect(validateGraphqlReadOnly('query Q { a }').ok).toBe(true);
    expect(validateGraphqlReadOnly(INTROSPECTION_QUERY).ok).toBe(true);
  });

  it('rejects mutations and subscriptions', () => {
    expect(validateGraphqlReadOnly('mutation { x3Stock { miscellaneousReceipt { create(data: {}) { id } } } }').ok).toBe(false);
    expect(validateGraphqlReadOnly('  Mutation{a}').ok).toBe(false);
    expect(validateGraphqlReadOnly('subscription { a }').ok).toBe(false);
    expect(validateGraphqlReadOnly('{ a } mutation { b }').ok).toBe(false);
  });

  it('ignores the words in strings and comments', () => {
    expect(validateGraphqlReadOnly('# mutation here\n{ a(filter: "{name: \'mutation\'}") }').ok).toBe(true);
    expect(validateGraphqlReadOnly('{ a(x: """mutation""") }').ok).toBe(true);
  });

  it('rejects unterminated strings and empty queries', () => {
    expect(validateGraphqlReadOnly('{ a(x: "oops) }').ok).toBe(false);
    expect(validateGraphqlReadOnly('   ').ok).toBe(false);
  });
});
