import type { PageSignal } from '@x3i/shared';

export type PageGroup = 'dataset' | 'folder' | 'function' | 'object' | 'window' | 'screen';

export interface PageRule {
  id: string;
  target: 'url' | 'title';
  /** Regular expression source. Named groups among: folder, function, object, window, screen. */
  pattern: string;
  flags?: string;
  /** The rule's match alone means the page is a Sage X3 page. */
  marksX3?: boolean;
  /** hypothesis: never checked on a real Syracuse page. verified: checked by the user. */
  status: 'hypothesis' | 'verified';
  description: string;
}

/**
 * Default rules. "verified" = checked on a real page: X3 Cloud V12, snouestboissons.em.cloud-by-sage.fr,
 * function GESBPC, 2026-10-02 (test/realUrl.test.ts). The segment after /trans/x3/erp/ is the endpoint
 * DATASET, not always the X3 server folder: on the same Cloud, endpoint "Recette" has dataset RECETTE
 * and server folder REC (Syracuse /me response, 2026-10-02).
 */
export const DEFAULT_PAGE_RULES: readonly PageRule[] = [
  {
    id: 'syracuse-main-path',
    target: 'url',
    pattern: '/syracuse-main/',
    marksX3: true,
    status: 'verified',
    description: 'Syracuse web client path',
  },
  {
    id: 'syracuse-erp-dataset',
    target: 'url',
    pattern: '/trans/x3/erp/(?<dataset>[A-Za-z0-9_]+)/',
    marksX3: true,
    status: 'verified',
    description: 'Endpoint dataset in the classic page URL (/trans/x3/erp/<DATASET>/)',
  },
  {
    id: 'syracuse-function-param',
    target: 'url',
    pattern: '[?&]f=(?<function>[A-Z][A-Z0-9_]{1,19})(?=[/&#]|$)',
    status: 'verified',
    description: 'Function code in the classic page URL (f=GESBPC/...)',
  },
];

export interface RuleMatchResult {
  values: Partial<Record<PageGroup, { value: string; ruleId: string; status: PageRule['status'] }>>;
  marksX3: { ruleId: string; status: PageRule['status'] } | undefined;
  signals: PageSignal[];
}

const GROUPS: readonly PageGroup[] = ['dataset', 'folder', 'function', 'object', 'window', 'screen'];

/** URLs of classic pages are often encoded several times: decode until stable (max 4 passes). */
export function decodeRepeatedly(s: string): string {
  let cur = s;
  for (let i = 0; i < 4; i++) {
    let next: string;
    try {
      next = decodeURIComponent(cur);
    } catch {
      return cur;
    }
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

export function applyPageRules(url: string, title: string, rules: readonly PageRule[]): RuleMatchResult {
  const decodedUrl = decodeRepeatedly(url);
  const result: RuleMatchResult = { values: {}, marksX3: undefined, signals: [] };
  for (const rule of rules) {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, rule.flags ?? '');
    } catch {
      continue; // invalid user rule: ignored, reported by the settings screen
    }
    const text = rule.target === 'url' ? decodedUrl : title;
    const m = re.exec(text);
    if (!m) continue;
    const groups: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.groups ?? {})) if (v) groups[k] = v;
    result.signals.push({ ruleId: rule.id, status: rule.status, target: rule.target, matched: m[0], groups });
    if (rule.marksX3 && !result.marksX3) result.marksX3 = { ruleId: rule.id, status: rule.status };
    for (const g of GROUPS) {
      const v = groups[g];
      // first rule wins, verified rules first (rules are pre-sorted by the caller if needed)
      if (v && !result.values[g]) result.values[g] = { value: v.toUpperCase(), ruleId: rule.id, status: rule.status };
    }
  }
  return result;
}

export function validateRule(rule: PageRule): string | null {
  try {
    new RegExp(rule.pattern, rule.flags ?? '');
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
