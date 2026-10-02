import type { GqlSchemaIndex } from '@x3i/x3-core';
import { Button, Card, Message, Spinner } from '../../components/ui';

/** Explains and loads the X3 GraphQL schema (list of objects and fields) used by QUERY and OBJECTS. */
export function SchemaLoader({ index, loading, error, onLoad }: { index: GqlSchemaIndex | null; loading: boolean; error: string | null; onLoad: (refresh: boolean) => void }) {
  if (index && !error) {
    return (
      <p className="small muted" style={{ margin: '0 0 6px' }}>
        {index.nodes.length} X3 objects available (GraphQL schema of this endpoint).{' '}
        <button type="button" className="link" onClick={() => onLoad(true)} title="Download the schema again (after an X3 update or a new specific object)">
          Reload schema
        </button>
      </p>
    );
  }
  return (
    <Card title="X3 objects">
      <p className="small muted">
        The list of X3 objects and fields comes from the GraphQL schema of the X3 tab (about 20 s the first time, then kept locally; no business data is stored).
      </p>
      {error && <Message kind="error">{error}</Message>}
      <Button variant="primary" onClick={() => onLoad(false)} disabled={loading}>
        {loading ? <Spinner /> : 'Load X3 objects'}
      </Button>
    </Card>
  );
}
