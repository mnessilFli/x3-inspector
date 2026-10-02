import { Button, Card, Collapsible, Message, Spinner } from '../../components/ui';
import { usePage } from '../../state/PageContext';
import { useNav } from '../../state/NavContext';
import { AccessHelp } from './AccessHelp';
import { FieldCard } from './FieldCard';
import { QueryValue } from './QueryValue';
import { useResolvedField } from './useResolvedField';

export function FieldView() {
  const page = usePage();
  const nav = useNav();
  const { inspection, effective } = page;
  const syracuseExact = inspection?.syracuse?.how === 'focus';
  const tableName = effective.mainTable.value;
  const { table, tableError, loading, resolved } = useResolvedField(inspection, tableName);

  return (
    <>
      <Card
        title="Field inspector"
        actions={
          <Button variant={page.inspecting ? 'default' : 'primary'} active={page.inspecting} onClick={() => void page.setInspecting(!page.inspecting)}>
            {page.inspecting ? 'Stop inspecting' : 'Inspect fields'}
          </Button>
        }
      >
        {page.contentStatus === 'unavailable' && <AccessHelp />}
        {page.inspecting ? (
          <p className="small muted">Hover a field in X3: it is outlined. Click it to inspect. Esc stops the mode. Shortcut: Ctrl+Shift+X.</p>
        ) : (
          !inspection && <p className="small muted">Click "Inspect fields", then click a field on the X3 screen.</p>
        )}
        {!tableName && inspection && !syracuseExact && (
          <Message kind="info">Main table unknown: the technical name cannot be confirmed. Set it in CURRENT &gt; Screen.</Message>
        )}
        {loading && <Spinner />}
        {tableError && <Message kind="warn">{tableError}</Message>}
      </Card>

      {inspection && resolved && (
        <Card
          title={inspection.syracuse?.field ?? resolved.name.value ?? 'Unknown field'}
          actions={
            inspection.syracuse?.field ? (
              <Button small onClick={() => nav.go('CURRENT', 'record')}>
                Record (GraphQL)
              </Button>
            ) : undefined
          }
        >
          <FieldCard inspection={inspection} resolved={resolved} table={table} ctx={effective} />
          {table && resolved.field && <QueryValue table={table} field={resolved.field} value={inspection.displayedValue.value ?? ''} />}
          <Collapsible summary={`Detection details (${inspection.candidates.length} candidates)`}>
            <ul className="list">
              {inspection.candidates.slice(0, 20).map((c) => {
                const check = resolved.checked.find((x) => x.name === c.name);
                return (
                  <li key={c.name}>
                    <span className="mono">{c.name}</span> <span className="muted">score {c.score} · {c.origin}</span>
                    {check && <span className={check.found ? 'badge METADATA' : 'badge UNKNOWN'}>{check.found ? `in ${table?.name}` : 'not in table'}</span>}
                  </li>
                );
              })}
              {inspection.candidates.length === 0 && <li className="muted">No token looking like an X3 code in the element attributes.</li>}
            </ul>
            <p className="small muted">Full DOM snapshot: TOOLS &gt; DOM Debug.</p>
          </Collapsible>
        </Card>
      )}
    </>
  );
}
