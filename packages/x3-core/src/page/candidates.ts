import type { DomNodeSnapshot, FieldNameCandidate } from '@x3i/shared';

/**
 * Extracts tokens that look like X3 codes from DOM attributes. Pure heuristic: candidates are only
 * ordering hints. A candidate is confirmed only by metadata (see resolveField.ts).
 */

const CODE_TOKEN = /^[A-Z][A-Z0-9_]{1,19}$/;
const SPLIT = /[\s\-.:/#,;|()[\]{}"'=]+/;
const ATTRIBUTE_WEIGHT: Record<string, number> = {
  'data-field': 50,
  'data-name': 45,
  'data-fld': 45,
  'data-code': 40,
  name: 40,
  id: 30,
  'data-id': 25,
  'aria-label': 5,
  title: 5,
  class: 10,
};
const IGNORED_TOKENS = new Set(['DIV', 'SPAN', 'INPUT', 'TRUE', 'FALSE', 'NULL', 'ID', 'OK', 'UI', 'HTML', 'CSS', 'SVG']);

export function tokensFromValue(value: string): string[] {
  const out = new Set<string>();
  for (const raw of value.split(SPLIT)) {
    if (!raw) continue;
    if (CODE_TOKEN.test(raw)) out.add(raw);
    // BPCNUM_0 -> BPCNUM as well (physical column name)
    const m = /^(.+)_\d+$/.exec(raw);
    if (m && CODE_TOKEN.test(m[1] as string)) out.add(m[1] as string);
  }
  return [...out].filter((t) => !IGNORED_TOKENS.has(t));
}

function attributeWeight(name: string): number {
  if (name in ATTRIBUTE_WEIGHT) return ATTRIBUTE_WEIGHT[name] as number;
  if (name.startsWith('data-')) return 20;
  if (name.startsWith('aria-')) return 3;
  return 8;
}

/** Element first, then parents (closest first). Closer nodes score higher. */
export function extractCandidates(element: DomNodeSnapshot, parents: DomNodeSnapshot[]): FieldNameCandidate[] {
  const best = new Map<string, FieldNameCandidate>();
  const nodes = [element, ...parents];
  nodes.forEach((node, depth) => {
    for (const [attrName, value] of Object.entries(node.attributes)) {
      const w = attributeWeight(attrName);
      for (const token of tokensFromValue(value)) {
        const score = w * (depth === 0 ? 2 : 1) - depth * 4;
        const origin = `${depth === 0 ? 'element' : `parent[${depth}]`}@${attrName}`;
        const prev = best.get(token);
        if (!prev || prev.score < score) best.set(token, { name: token, origin, score });
      }
    }
  });
  return [...best.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
