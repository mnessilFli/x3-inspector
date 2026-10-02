import type { DomNodeSnapshot } from '@x3i/shared';
import { SourcedValue } from '../../components/provenance';
import { Card, CopyButton, Empty } from '../../components/ui';
import { usePage } from '../../state/PageContext';
import { useResolvedField } from '../current/useResolvedField';
import { SyracuseDebugCard } from './SyracuseDebugCard';

function NodeView({ node, title }: { node: DomNodeSnapshot; title: string }) {
  return (
    <li>
      <span className="muted small">{title}</span> <span className="mono">&lt;{node.tag}&gt;</span>
      {node.text && <span className="muted"> "{node.text}"</span>}
      <pre className="code">
        {Object.entries(node.attributes)
          .map(([k, v]) => `${k}="${v}"`)
          .join('\n') || '(no attribute)'}
      </pre>
    </li>
  );
}

/** Everything detected about the last inspected element, to calibrate the detection rules. */
export function DomDebugView() {
  const { inspection, context, effective } = usePage();
  const { resolved, table } = useResolvedField(inspection, effective.mainTable.value);
  if (!inspection)
    return (
      <>
        <SyracuseDebugCard />
        <Empty>Inspect a field first (CURRENT &gt; Field). Its DOM snapshot appears here.</Empty>
      </>
    );
  const snapshot = { inspection, context, resolvedName: resolved?.name, checkedAgainst: table?.name ?? null, checks: resolved?.checked };

  return (
    <>
      <SyracuseDebugCard />
      <Card title="Detected information" actions={<CopyButton label="Copy JSON" value={JSON.stringify(snapshot, null, 2)} />}>
        <div className="info">
          <div className="k">Label</div>
          <div className="v">
            <SourcedValue value={inspection.label} />
          </div>
          <div className="k">Value</div>
          <div className="v">
            <SourcedValue value={inspection.displayedValue} />
          </div>
          <div className="k">Technical name</div>
          <div className="v">{resolved && <SourcedValue value={resolved.name} />}</div>
          <div className="k">Frame</div>
          <div className="v small mono">
            {inspection.dom.isTopFrame ? 'top frame' : 'sub frame'} · {inspection.dom.frameUrl}
          </div>
          <div className="k">CSS path</div>
          <div className="v small mono">{inspection.dom.cssPath}</div>
        </div>
      </Card>
      <Card title={`Candidates (${inspection.candidates.length})`}>
        <ul className="list">
          {inspection.candidates.map((c) => {
            const chk = resolved?.checked.find((x) => x.name === c.name);
            return (
              <li key={c.name}>
                <span className="mono">{c.name}</span> <span className="muted small">score {c.score} · {c.origin}</span>
                {chk && <span className={`badge ${chk.found ? 'METADATA' : 'UNKNOWN'}`}>{chk.found ? 'confirmed' : 'not in table'}</span>}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title="Element and parents">
        <ul className="list">
          <NodeView node={inspection.dom.element} title="element" />
          {inspection.dom.parents.map((p, i) => (
            <NodeView key={i} node={p} title={`parent[${i + 1}]`} />
          ))}
        </ul>
      </Card>
    </>
  );
}
