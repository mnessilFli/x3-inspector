import type { X3Relation } from '@x3i/shared';
import { ConfidenceBadge, sourceText } from '../../components/provenance';
import { Button } from '../../components/ui';

/** Relations with their provenance. Inferred ones are always flagged "verification required". */
export function RelationList({
  relations,
  onOpenTable,
  onQuery,
  queryLabel = 'Query related',
}: {
  relations: X3Relation[];
  onOpenTable?: (table: string) => void;
  onQuery?: (r: X3Relation) => void;
  queryLabel?: string;
}) {
  if (relations.length === 0) return <p className="small muted">No relation found in the dictionary nor by key inference.</p>;
  const groups: Array<['outgoing' | 'incoming', string]> = [
    ['outgoing', 'This table references'],
    ['incoming', 'Referenced by'],
  ];
  return (
    <>
      {groups.map(([dir, title]) => {
        const list = relations.filter((r) => r.direction === dir);
        if (list.length === 0) return null;
        return (
          <div key={dir}>
            <h3>
              {title} ({list.length})
            </h3>
            <ul className="list">
              {list.map((r, i) => {
                const other = dir === 'outgoing' ? r.toTable : r.fromTable;
                return (
                  <li key={i}>
                    <span className="mono">
                      {r.fromTable}.{r.fromColumns.join('+')}
                    </span>
                    <span className="rel-arrow">→</span>
                    <span className="mono">
                      {r.toTable}.{r.toColumns.join('+')}
                    </span>
                    <ConfidenceBadge confidence={r.prov.confidence} />
                    <span className="src">
                      {r.label}
                      {r.prov.detail ? ` · ${sourceText(r.prov)}` : ''}
                    </span>
                    <span className="btn-row" style={{ marginTop: 3 }}>
                      {onOpenTable && (
                        <Button small onClick={() => onOpenTable(other)}>
                          Open {other}
                        </Button>
                      )}
                      {onQuery && (
                        <Button small onClick={() => onQuery(r)}>
                          {queryLabel}
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}
