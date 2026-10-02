/** Standard GraphQL introspection query (same content as the one GraphiQL sends), with descriptions. */
export const INTROSPECTION_QUERY = `query X3InspectorIntrospection {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      kind name description
      fields(includeDeprecated: true) {
        name description
        args { name description type { ...TypeRef } defaultValue }
        type { ...TypeRef }
      }
      inputFields { name description type { ...TypeRef } defaultValue }
      enumValues(includeDeprecated: true) { name description }
    }
  }
}
fragment TypeRef on __Type {
  kind name
  ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
}`;

/**
 * Endpoint used by the GraphiQL explorer of Syracuse, observed on X3 Cloud (2026-10-02):
 * POST <origin>/xtrem/explorer/ with Content-Type application/json and the session cookie,
 * no x-xtrem-endpoint header (the session's endpoint is used). Not documented by Sage.
 */
export const SESSION_GRAPHQL_PATH = '/xtrem/explorer/';
