import type { X3Table } from '@x3i/shared';
import { AttrValue, ConfidenceBadge, CustomBadge, InfoRow, SourceLine } from '../../components/provenance';

export function TableSummaryInfo({ table }: { table: X3Table }) {
  return (
    <>
      <div className="info">
        <InfoRow k="Table">
          <span className="val">{table.name}</span>
          <ConfidenceBadge confidence="EXACT" />
          <span className="src">SQL catalog</span>
        </InfoRow>
        <InfoRow k="Description">
          <AttrValue attr={table.description} />
        </InfoRow>
        <InfoRow k="Abbreviation">
          <AttrValue attr={table.abbreviation} />
        </InfoRow>
        <InfoRow k="Module">
          <AttrValue attr={table.module} />
        </InfoRow>
        <InfoRow k="Activity code">
          <AttrValue attr={table.activityCode} />
        </InfoRow>
        <InfoRow k="Rows">{table.rowCount === null ? <span className="unknown">Unknown</span> : <span className="val">{table.rowCount.toLocaleString()}</span>}</InfoRow>
        <InfoRow k="Primary key">
          {table.primaryKey ? (
            <>
              <span className="val">{table.primaryKey.value.join(', ')}</span>
              <ConfidenceBadge confidence={table.primaryKey.prov.confidence} />
              <SourceLine prov={table.primaryKey.prov} />
            </>
          ) : (
            <span className="unknown">Unknown</span>
          )}
        </InfoRow>
        <InfoRow k="Standard / Custom">
          <CustomBadge flag={table.custom} />
          <span className="src">{table.custom.reason}</span>
        </InfoRow>
      </div>
      {table.unknowns.length > 0 && (
        <ul className="list small muted" style={{ marginTop: 6 }}>
          {table.unknowns.map((u) => (
            <li key={u}>Unknown · {u}</li>
          ))}
        </ul>
      )}
    </>
  );
}
