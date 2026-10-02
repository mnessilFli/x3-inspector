import { SourcedValue } from '../../components/provenance';
import { Button, Card, Collapsible, Message, Spinner } from '../../components/ui';
import { useNav } from '../../state/NavContext';
import { usePage } from '../../state/PageContext';
import { CONTEXT_KEYS, CONTEXT_LABELS } from '../../state/pageModel';
import { AccessHelp } from './AccessHelp';
import { ContextRow } from './ContextRow';

export function ScreenView() {
  const page = usePage();
  const nav = useNav();
  const { context, effective, resolution } = page;
  const table = effective.mainTable.value;

  return (
    <>
      <Card
        title="Current X3 screen"
        actions={
          <Button variant="primary" onClick={() => void page.inspectScreen()} disabled={page.loading}>
            {page.loading ? <Spinner /> : 'Inspect current X3 screen'}
          </Button>
        }
      >
        {page.error && <Message kind="error">{page.error}</Message>}
        {page.contentStatus === 'unavailable' && <AccessHelp />}
        {!context && page.contentStatus !== 'unavailable' && (
          <p className="muted small">Open a Sage X3 page, then click "Inspect current X3 screen". Values can also be set manually.</p>
        )}
        {context && (
          <div className="info" style={{ marginBottom: 8 }}>
            <div className="k">Sage X3 page</div>
            <div className="v">
              <SourcedValue value={context.isX3} />
            </div>
            <div className="k">Title</div>
            <div className="v">{context.title || <span className="unknown">none</span>}</div>
            {context.session && (
              <>
                <div className="k">Screen title</div>
                <div className="v">
                  <SourcedValue value={context.session.screenTitle} />
                </div>
                <div className="k">Endpoint</div>
                <div className="v">
                  <SourcedValue value={context.session.endpoint} />
                </div>
                <div className="k">Role</div>
                <div className="v">
                  <SourcedValue value={context.session.role} />
                </div>
                <div className="k">Language</div>
                <div className="v">
                  <SourcedValue value={context.session.locale} />
                </div>
              </>
            )}
          </div>
        )}
        <div className="info">
          {CONTEXT_KEYS.map((k) => (
            <ContextRow key={k} label={CONTEXT_LABELS[k]} value={effective[k]} overridden={page.overrides[k] !== undefined} onOverride={(v) => page.setOverride(k, v)} />
          ))}
        </div>
        {page.resolveError && (
          <div style={{ marginTop: 8 }}>
            <Message kind="warn">Metadata resolution: {page.resolveError}</Message>
          </div>
        )}
        {resolution && resolution.candidates.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <Message kind="info">
              Several candidate tables:{' '}
              {resolution.candidates.map((c) => (
                <button key={c} type="button" className="link mono" style={{ marginRight: 8 }} onClick={() => page.setOverride('mainTable', c)}>
                  {c}
                </button>
              ))}
            </Message>
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <Button disabled={!table} onClick={() => table && nav.openTable(table)}>
            Explore table
          </Button>
          <Button disabled={!table} onClick={() => table && nav.openRecord(table)}>
            Inspect Current Record
          </Button>
          <Button onClick={() => nav.go('CURRENT', 'field')}>Inspect fields</Button>
        </div>
      </Card>
      {context && (
        <Card title="Detection details">
          <div className="small muted" style={{ overflowWrap: 'anywhere' }}>
            {context.url}
          </div>
          <Collapsible summary={`Signals (${context.signals.length})`}>
            {context.signals.length === 0 ? (
              <p className="small muted">No URL / title rule matched. Rules can be added in TOOLS &gt; Settings.</p>
            ) : (
              <ul className="list">
                {context.signals.map((s, i) => (
                  <li key={i}>
                    <span className="mono">{s.ruleId}</span>
                    {s.status && <span className="src"> ({s.status})</span>} on {s.target}: <code>{s.matched}</code>
                    {Object.keys(s.groups).length > 0 && <span className="src">{JSON.stringify(s.groups)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Collapsible>
          <p className="small muted">Detected {new Date(context.detectedAt).toLocaleTimeString()} · updates automatically when the function or tab changes.</p>
        </Card>
      )}
    </>
  );
}
