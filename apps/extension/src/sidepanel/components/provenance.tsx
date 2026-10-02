import type { Attr, Confidence, CustomFlag, Provenance, Sourced } from '@x3i/shared';
import type { ReactNode } from 'react';

const SOURCE_LABEL: Record<Provenance['source'], string> = {
  'sql-catalog': 'SQL catalog',
  'x3-dictionary': 'X3 dictionary',
  'x3-context-files': 'x3-context files',
  'x3-convention': 'X3 convention',
  dom: 'DOM',
  url: 'URL / title',
  syracuse: 'Syracuse',
  config: 'configuration',
  manual: 'manual',
  inference: 'inference',
  'knowledge-base': 'knowledge base',
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className={`badge ${confidence}`}>{confidence}</span>;
}

export function sourceText(prov: Provenance): string {
  return `${SOURCE_LABEL[prov.source]}${prov.detail ? ` · ${prov.detail}` : ''}`;
}

export function SourceLine({ prov }: { prov: Provenance }) {
  return <span className="src">{sourceText(prov)}</span>;
}

/** Value with badge and source, or "Unknown" with the reason. */
export function SourcedValue({ value, render }: { value: Sourced<string> | Sourced<boolean> | undefined; render?: (v: string) => ReactNode }) {
  if (!value || value.value === null) {
    return (
      <>
        <span className="unknown">Unknown</span>
        <ConfidenceBadge confidence="UNKNOWN" />
        {value?.prov.detail && <span className="src">{value.prov.detail}</span>}
      </>
    );
  }
  const text = typeof value.value === 'boolean' ? (value.value ? 'Yes' : 'No') : value.value;
  return (
    <>
      <span className="val">{render ? render(text) : text}</span>
      <ConfidenceBadge confidence={value.prov.confidence} />
      <SourceLine prov={value.prov} />
    </>
  );
}

export function AttrValue<T extends string | number>({ attr, missing = 'Unknown' }: { attr: Attr<T> | undefined; missing?: string }) {
  if (!attr) return <span className="unknown">{missing}</span>;
  return (
    <>
      <span className="val">{String(attr.value)}</span>
      <ConfidenceBadge confidence={attr.prov.confidence} />
      <SourceLine prov={attr.prov} />
    </>
  );
}

export function attrToSourced<T>(a: Attr<T> | undefined, reason: string): Sourced<T> {
  return a ? { value: a.value, prov: a.prov } : { value: null, prov: { source: 'inference', confidence: 'UNKNOWN', detail: reason } };
}

export function CustomBadge({ flag, compact }: { flag: CustomFlag; compact?: boolean }) {
  if (flag.level === 'standard') return <span title={flag.reason}>{compact ? 'No' : 'Standard'}</span>;
  const confirmed = flag.level === 'custom';
  return (
    <span className={`custom-flag${confirmed ? ' confirmed' : ''}`} title={flag.reason}>
      {compact ? (confirmed ? 'Yes' : 'Yes?') : `⚠ ${confirmed ? 'CUSTOM' : 'CUSTOM FIELD (suspected)'}`}
    </span>
  );
}

export function InfoRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </>
  );
}
