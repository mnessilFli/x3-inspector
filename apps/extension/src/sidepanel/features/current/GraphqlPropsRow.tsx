import { baseX3Field } from '@x3i/x3-core';
import { InfoRow } from '../../components/provenance';
import { useSchemaIndex } from '../../state/useSchemaIndex';

/** GraphQL properties whose schema description declares this X3 field (only if the schema was loaded once). */
export function GraphqlPropsRow({ field }: { field: string }) {
  const { index: loaded, scope } = useSchemaIndex();
  const index = scope ? loaded : undefined;

  const base = baseX3Field(field);
  const hits = index?.byX3Field.get(base) ?? [];
  return (
    <InfoRow k="GraphQL properties">
      {index === undefined ? (
        <span className="muted">...</span>
      ) : index === null ? (
        <span className="unknown">schema not loaded yet: read one record in CURRENT &gt; Record (GraphQL)</span>
      ) : hits.length === 0 ? (
        <span className="unknown">no GraphQL property declares {base}</span>
      ) : (
        <>
          <span className="val mono">{hits.slice(0, 6).map((h) => `${h.node.node}.${h.prop.name}`).join(', ')}</span>
          <span className="src">
            {hits.length} propert{hits.length > 1 ? 'ies' : 'y'} with "({base})" in the schema description
          </span>
        </>
      )}
    </InfoRow>
  );
}
