import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { copyText } from '../../lib/clipboard';

type BtnVariant = 'default' | 'primary' | 'danger';

export function Button({
  variant = 'default',
  small,
  active,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; small?: boolean; active?: boolean }) {
  const cls = ['btn', variant !== 'default' ? variant : '', small ? 'small' : '', active ? 'active' : '', className ?? ''].filter(Boolean).join(' ');
  return <button type="button" className={cls} {...rest} />;
}

export function CopyButton({ value, label = 'Copy', small = true, disabled }: { value: string; label?: string; small?: boolean; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      small={small}
      disabled={disabled || !value}
      title={value}
      onClick={async () => {
        if (await copyText(value)) {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title !== undefined || actions !== undefined) && (
        <div className="card-head">
          {title !== undefined && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Message({ kind, children }: { kind: 'error' | 'warn' | 'info' | 'ok'; children: ReactNode }) {
  return <div className={`msg ${kind}`}>{children}</div>;
}

export function Spinner() {
  return <span className="spinner" aria-label="loading" />;
}

export function Collapsible({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="collapsible" open={open}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function SubTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="subnav">
      {tabs.map((t) => (
        <button key={t.id} type="button" className={t.id === value ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
