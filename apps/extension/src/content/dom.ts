import { known, unknown, type DomNodeSnapshot, type DomSnapshot, type Sourced } from '@x3i/shared';

const MAX_PARENTS = 8;
const MAX_ATTR = 200;
const MAX_TEXT = 80;
const MAX_VALUE = 500;
const FORM_CONTROLS = 'input, select, textarea';
const FIELD_LIKE =
  'input, select, textarea, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="gridcell"], [role="cell"], td';

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function ownText(el: Element): string {
  let t = '';
  for (const n of Array.from(el.childNodes)) if (n.nodeType === Node.TEXT_NODE) t += n.textContent ?? '';
  return t.replace(/\s+/g, ' ').trim();
}

export function snapshotNode(el: Element): DomNodeSnapshot {
  const attributes: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attributes[a.name] = truncate(a.value, MAX_ATTR);
  const node: DomNodeSnapshot = { tag: el.tagName.toLowerCase(), attributes };
  const text = ownText(el);
  if (text) node.text = truncate(text, MAX_TEXT);
  return node;
}

export function cssPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let i = 0; cur && i < 6 && cur !== document.documentElement; i++) {
    let part = cur.tagName.toLowerCase();
    if (cur.id) {
      parts.unshift(`${part}#${CSS.escape(cur.id)}`);
      break;
    }
    const cls = Array.from(cur.classList).slice(0, 2);
    if (cls.length) part += `.${cls.map((c) => CSS.escape(c)).join('.')}`;
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur?.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

export function buildSnapshot(el: Element): DomSnapshot {
  const parents: DomNodeSnapshot[] = [];
  let p = el.parentElement;
  while (p && parents.length < MAX_PARENTS && p !== document.documentElement) {
    parents.push(snapshotNode(p));
    p = p.parentElement;
  }
  return { element: snapshotNode(el), parents, cssPath: cssPath(el), frameUrl: location.href, isTopFrame: window.top === window };
}

/** Element that best represents a field around the raw event target. */
export function fieldElementFrom(target: Element): Element | null {
  if (target === document.documentElement || target === document.body) return null;
  return target.closest(FIELD_LIKE) ?? target;
}

function visibleText(el: Element): string {
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Label heuristics, most explicit first. */
export function findLabel(el: Element): Sourced<string> {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return known(aria, 'dom', 'EXACT', 'aria-label');

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter((x): x is HTMLElement => x !== null)
      .map(visibleText)
      .join(' ')
      .trim();
    if (text) return known(text, 'dom', 'EXACT', 'aria-labelledby');
  }

  if (el.id) {
    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const text = lab ? visibleText(lab) : '';
    if (text) return known(text, 'dom', 'EXACT', 'label[for]');
  }

  const wrapping = el.closest('label');
  if (wrapping) {
    const text = visibleText(wrapping);
    if (text) return known(truncate(text, 80), 'dom', 'INFERRED', 'enclosing label element');
  }

  const near = precedingText(el);
  if (near) return known(near, 'dom', 'INFERRED', 'nearest preceding text in the row');

  const title = el.getAttribute('title')?.trim();
  if (title) return known(title, 'dom', 'INFERRED', 'title attribute');
  const ph = el.getAttribute('placeholder')?.trim();
  if (ph) return known(ph, 'dom', 'INFERRED', 'placeholder attribute');

  return unknown('no label found near the element');
}

/** Walks up a few levels and returns the last short text of a previous sibling without form controls. */
function precedingText(el: Element): string | undefined {
  let child: Element | null = el;
  for (let level = 0; level < 4 && child?.parentElement; level++) {
    let sib = child.previousElementSibling;
    while (sib) {
      if (!sib.querySelector(FORM_CONTROLS) && !sib.matches(FORM_CONTROLS)) {
        const t = visibleText(sib);
        if (t && t.length <= 60) return t;
      }
      sib = sib.previousElementSibling;
    }
    child = child.parentElement;
  }
  return undefined;
}

/** Displayed value. May be formatted by X3 (dates, numbers, local menu label). */
export function readValue(el: Element): Sourced<string> {
  const detail = 'displayed value (may be formatted)';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return known(el.checked ? 'checked' : 'unchecked', 'dom', 'EXACT', `${el.type} state`);
    return known(el.value, 'dom', 'EXACT', detail);
  }
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    return known(opt?.text ?? el.value, 'dom', 'EXACT', `selected option text (value "${el.value}")`);
  }
  if (el instanceof HTMLTextAreaElement) return known(truncate(el.value, MAX_VALUE), 'dom', 'EXACT', detail);
  const inner = el.querySelector(FORM_CONTROLS);
  if (inner) return readValue(inner);
  const text = visibleText(el);
  if (text) return known(truncate(text, MAX_VALUE), 'dom', 'EXACT', 'element text');
  return unknown('element has no value or text');
}

