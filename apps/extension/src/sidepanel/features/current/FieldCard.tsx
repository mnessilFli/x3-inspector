import { known, unknown, type FieldInspection, type Sourced, type X3Field, type X3Table } from '@x3i/shared';
import { buildWhere, isNumericSqlType, screenFieldSyntax, tableFieldSyntax, type ResolvedField } from '@x3i/x3-core';
import { looksFormatted } from '../../../lib/format';
import { AttrValue, attrToSourced, CustomBadge, InfoRow, SourcedValue } from '../../components/provenance';
import { CopyButton } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';
import type { EffectiveContext } from '../../state/pageModel';
import { GraphqlPropsRow } from './GraphqlPropsRow';
import { LocalMenuInfo } from './LocalMenuInfo';

interface Props {
  inspection: FieldInspection;
  resolved: ResolvedField;
  table: X3Table | null;
  ctx: EffectiveContext;
}

/** Field card shaped like the spec: functional label, value, screen / table names, types, keys, syntaxes. */
export function FieldCard({ inspection, resolved, table, ctx }: Props) {
  const { dialect } = useSettings();
  const field = resolved.field;
  const syr = inspection.syracuse;
  const syrConf = syr?.how === 'focus' ? 'EXACT' : 'INFERRED';
  const syrDetail = syr
    ? `${syr.how === 'focus' ? 'Syracuse: cursor entered' : 'label + type + length match on'} ${syr.xid} = ${syr.x3Name}${syr.alternatives.length ? ` · also possible: ${syr.alternatives.join(', ')}` : ''}`
    : '';
  const screenField: Sourced<string> = syr?.field ? known(syr.field, 'syracuse', syrConf, syrDetail) : resolved.name;
  const screenOf: Sourced<string> = syr?.screen ? known(syr.screen, 'syracuse', syrConf, `prefix of ${syr.x3Name}`) : ctx.screen;
  const name = field?.name ?? screenField.value;
  const value = inspection.displayedValue.value ?? '';
  const abbr = ctx.abbreviation.value;
  const screen = screenOf.value;

  const tableSyntax: Sourced<string> =
    abbr && name ? known(tableFieldSyntax(abbr, name), ctx.abbreviation.prov.source, worst(ctx.abbreviation, resolved.name), 'from table abbreviation + field') : unknown('table abbreviation or field unknown');
  const screenSyntax: Sourced<string> =
    screen && name ? known(screenFieldSyntax(screen, name), 'inference', 'INFERRED', 'screen code used as screen abbreviation, verify') : unknown('screen or field unknown');

  const column = field?.columns[0]?.name;
  const where = column ? buildWhere([{ column, value, numeric: isNumericSqlType(field?.sqlType) }], dialect ?? 'mssql') : '';
  const indexes = field && table ? table.indexes.filter((i) => i.fields.some((f) => f.toUpperCase() === field.name.toUpperCase())) : [];
  const json = JSON.stringify(
    {
      label: inspection.label.value,
      value,
      screenField: screenField.value,
      syracuseName: syr?.x3Name ?? null,
      screen,
      table: table?.name ?? ctx.mainTable.value,
      tableAbbreviation: abbr,
      columns: field?.columns.map((c) => c.name) ?? [],
      x3Type: field?.x3Type?.value ?? null,
      sqlType: field?.sqlType ?? null,
      length: field?.length ?? null,
      primaryKey: field?.isKey ?? null,
      custom: field?.custom.level ?? null,
    },
    null,
    2,
  );

  return (
    <>
      <div className="info">
        <InfoRow k="Functional label">
          <SourcedValue value={inspection.label} />
          {field?.label && (
            <span className="src">
              Dictionary: <b>{field.label.value}</b>
            </span>
          )}
        </InfoRow>
        <InfoRow k="Current value">
          <SourcedValue value={inspection.displayedValue} />
          {value && looksFormatted(value) && <span className="src">Looks formatted: the database value may differ.</span>}
        </InfoRow>
        <div className="sep" />
        <InfoRow k="Screen field">
          <SourcedValue value={screenField} />
        </InfoRow>
        <InfoRow k="Screen">
          <SourcedValue value={screenOf} />
        </InfoRow>
        {syr && (
          <>
            <InfoRow k="Window">
              <SourcedValue value={syr.window ? known(syr.window, 'syracuse', 'EXACT', `session window ${syr.win}`) : unknown('window not seen in the session')} />
            </InfoRow>
            <InfoRow k="Syracuse name">
              <span className="val mono">{syr.x3Name}</span>
              <span className="src">
                id {syr.xid} · type {syr.type ?? '?'}
                {syr.format ? ` · format ${syr.format}` : ''}
              </span>
            </InfoRow>
            <InfoRow k="Object">
              <SourcedValue value={syr.object ? known(syr.object, 'syracuse', 'EXACT', `$prototype.$object of window ${syr.window ?? '?'}`) : unknown('object not in the screen description')} />
            </InfoRow>
            <InfoRow k="Record key">
              <SourcedValue value={known(syr.isKey ? 'Yes' : 'No', 'syracuse', 'EXACT', '$prototype.$key of the window')} />
            </InfoRow>
            <InfoRow k="Local menu (screen)">
              {syr.localMenu !== null ? <span className="val">{syr.localMenu}</span> : <span className="unknown">none</span>}
            </InfoRow>
            {syr.field && <GraphqlPropsRow field={syr.field} />}
            <InfoRow k="X3 properties (Esc+F6)">
              {inspection.x3Properties ? (
                <>
                  <span className="val">{inspection.x3Properties.title}</span>
                  {inspection.x3Properties.entries.map((e, i) => (
                    <span key={i} className="src">
                      {e.key ? `${e.key} : ` : ''}
                      {e.value}
                    </span>
                  ))}
                  <span className="badge EXACT">EXACT</span>
                </>
              ) : (
                <span className="unknown" title="In X3, put the cursor in the field, press Esc, release it, then F6">
                  press Esc then F6 in the X3 field to load its data type
                </span>
              )}
            </InfoRow>
          </>
        )}
        <InfoRow k="Screen abbreviation">
          <SourcedValue value={unknown('screen dictionary not used in MVP 1')} />
        </InfoRow>
        <InfoRow k="Mandatory (screen)">
          <SourcedValue value={booleanText(inspection.uiHints?.mandatory)} />
        </InfoRow>
        <InfoRow k="Syracuse type">
          <SourcedValue value={inspection.uiHints?.uiType ?? unknown('Syracuse field container not found')} />
        </InfoRow>
        <InfoRow k="Max length (screen)">
          <SourcedValue value={numberText(inspection.uiHints?.maxLength)} />
        </InfoRow>
        <div className="sep" />
        <InfoRow k="Table">
          <SourcedValue value={ctx.mainTable} />
        </InfoRow>
        <InfoRow k="Table abbreviation">
          <SourcedValue value={ctx.abbreviation} />
        </InfoRow>
        <InfoRow k="Table field">
          {field ? <SourcedValue value={known(field.name, field.prov.source, field.prov.confidence, `columns ${field.columns.map((c) => c.name).join(', ')}`)} /> : <SourcedValue value={unknown(table ? `no candidate found in ${table.name}` : 'main table unknown')} />}
        </InfoRow>
        <div className="sep" />
        {field && <FieldTypeRows field={field} table={table} indexes={indexes.map((i) => i.name)} />}
        <div className="sep" />
        <InfoRow k="Table syntax">
          <SourcedValue value={tableSyntax} />
        </InfoRow>
        <InfoRow k="Screen syntax">
          <SourcedValue value={screenSyntax} />
        </InfoRow>
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <CopyButton label="Field" value={name ?? ''} />
        <CopyButton label="Table" value={table?.name ?? ctx.mainTable.value ?? ''} />
        <CopyButton label="[F:...]" value={tableSyntax.value ?? ''} />
        <CopyButton label="[M:...]" value={screenSyntax.value ?? ''} />
        <CopyButton label="Value" value={value} />
        <CopyButton label="SQL WHERE" value={where} />
        <CopyButton label="JSON" value={json} />
      </div>
      {where && <pre className="code">{where}</pre>}
    </>
  );
}

function FieldTypeRows({ field, table, indexes }: { field: X3Field; table: X3Table | null; indexes: string[] }) {
  return (
    <>
      <InfoRow k="X3 type">
        <AttrValue attr={field.x3Type} />
      </InfoRow>
      <InfoRow k="SQL type">
        <span className="val">
          {field.sqlType}
          {field.length !== null ? `(${field.length})` : ''}
        </span>
        {field.dimension > 1 && <span className="src">dimension {field.dimension}: {field.columns.map((c) => c.name).join(', ')}</span>}
      </InfoRow>
      <InfoRow k="Length">
        <AttrValue attr={field.x3Length} missing={field.length !== null ? `${field.length} (SQL)` : 'Unknown'} />
      </InfoRow>
      <InfoRow k="Primary key">
        <SourcedValue value={table?.primaryKey ? known(field.isKey ? 'Yes' : 'No', table.primaryKey.prov.source, table.primaryKey.prov.confidence, table.primaryKey.prov.detail) : unknown('primary key of the table unknown')} />
      </InfoRow>
      <InfoRow k="Index">{indexes.length ? <span className="val">{indexes.join(', ')}</span> : <span className="unknown">none</span>}</InfoRow>
      <InfoRow k="Activity code">
        <AttrValue attr={field.activityCode} />
      </InfoRow>
      <InfoRow k="Local menu">
        <AttrValue attr={field.localMenu} missing="none / unknown" />
        {field.localMenu && <LocalMenuInfo menu={field.localMenu.value} />}
      </InfoRow>
      <InfoRow k="Linked table">
        <SourcedValue value={attrToSourced(field.linkedTable, 'none / unknown')} />
      </InfoRow>
      <InfoRow k="Standard / Custom">
        <CustomBadge flag={field.custom} />
        <span className="src">
          {field.custom.reason} · {field.custom.confidence}
        </span>
      </InfoRow>
    </>
  );
}

function booleanText(v: Sourced<boolean> | undefined): Sourced<string> {
  if (!v) return unknown('Syracuse field container not found');
  return v.value === null ? { value: null, prov: v.prov } : { value: v.value ? 'Yes' : 'No', prov: v.prov };
}

function numberText(v: Sourced<number> | undefined): Sourced<string> {
  if (!v) return unknown('Syracuse field container not found');
  return v.value === null ? { value: null, prov: v.prov } : { value: String(v.value), prov: v.prov };
}

function worst(a: Sourced<string>, b: Sourced<string>) {
  const rank = { EXACT: 3, METADATA: 2, INFERRED: 1, UNKNOWN: 0 } as const;
  return rank[a.prov.confidence] <= rank[b.prov.confidence] ? a.prov.confidence : b.prov.confidence;
}
