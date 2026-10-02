import { DEFAULT_PAGE_RULES, validateRule, type PageRule } from '@x3i/x3-core';
import { useEffect, useState } from 'react';
import { Button, Collapsible, Message } from '../../components/ui';
import { useSettings } from '../../state/SettingsContext';

const EXAMPLE: PageRule[] = [
  {
    id: 'my-function-rule',
    target: 'url',
    pattern: '[?&]f=(?<function>[A-Z][A-Z0-9_]+)',
    status: 'hypothesis',
    description: 'Example: function code in the URL',
  },
];

function parseRules(text: string): { rules: PageRule[] } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(data)) return { error: 'Expected a JSON array of rules.' };
  const rules: PageRule[] = [];
  for (const [i, r] of data.entries()) {
    const o = r as Partial<PageRule>;
    if (!o || typeof o.id !== 'string' || typeof o.pattern !== 'string' || (o.target !== 'url' && o.target !== 'title')) {
      return { error: `Rule ${i + 1}: id, target ("url" or "title") and pattern are required.` };
    }
    const rule: PageRule = {
      id: o.id,
      target: o.target,
      pattern: o.pattern,
      status: o.status === 'verified' ? 'verified' : 'hypothesis',
      description: typeof o.description === 'string' ? o.description : '',
    };
    if (typeof o.flags === 'string') rule.flags = o.flags;
    if (o.marksX3 === true) rule.marksX3 = true;
    const err = validateRule(rule);
    if (err) return { error: `Rule ${o.id}: ${err}` };
    rules.push(rule);
  }
  return { rules };
}

/** User page detection rules (JSON). Named groups: folder, function, object, window, screen. */
export function PageRulesEditor() {
  const { settings, update } = useSettings();
  const [text, setText] = useState(() => JSON.stringify(settings.pageRules, null, 2));
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => setText(JSON.stringify(settings.pageRules, null, 2)), [settings.pageRules]);

  return (
    <div>
      <p className="small muted">
        Rules are regular expressions on the page URL or title with named groups (folder, function, object, window, screen). User rules run first.
        Matches of rules with status "hypothesis" are shown as INFERRED, "verified" as EXACT.
      </p>
      <textarea className="input" rows={8} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
      <div className="btn-row" style={{ marginTop: 6 }}>
        <Button
          variant="primary"
          small
          onClick={async () => {
            const r = parseRules(text);
            if ('error' in r) {
              setMsg({ kind: 'error', text: r.error });
              return;
            }
            await update({ pageRules: r.rules });
            setMsg({ kind: 'ok', text: `${r.rules.length} rule(s) saved. Inspect the screen again to apply them.` });
          }}
        >
          Save rules
        </Button>
        <Button small onClick={() => setText(JSON.stringify(EXAMPLE, null, 2))}>
          Insert example
        </Button>
      </div>
      {msg && (
        <div style={{ marginTop: 6 }}>
          <Message kind={msg.kind}>{msg.text}</Message>
        </div>
      )}
      <Collapsible summary={`Default rules (${DEFAULT_PAGE_RULES.length}, read only)`}>
        <pre className="code">{JSON.stringify(DEFAULT_PAGE_RULES, null, 2)}</pre>
      </Collapsible>
    </div>
  );
}
