import { known, unknown, type FieldInspection, type Sourced, type X3PageContext } from '@x3i/shared';
import { applyPageRules, DEFAULT_PAGE_RULES, extractCandidates, type PageGroup, type PageRule, type RuleMatchResult, type X3PageAdapter } from '@x3i/x3-core';
import { environmentForUrl } from '../lib/env';
import type { Settings } from '../lib/storage';
import { buildSnapshot, fieldElementFrom, findLabel, readValue } from './dom';
import { readSessionInfo, readUiHints } from './syracuse';
import type { SyracuseState } from './syracuseState';
import type { SyracuseFieldRef } from '@x3i/x3-core';

const DEBOUNCE_MS = 400;
const POLL_MS = 2000;

/**
 * Page adapter for the Syracuse web client. Built to learn: URL/title rules are declarative
 * (hypotheses by default), field names come from attribute candidates confirmed later by metadata.
 */
export class SyracusePageAdapter implements X3PageAdapter<Element> {
  readonly id = 'syracuse-dom';

  constructor(
    private settings: Settings,
    private readonly syracuse: SyracuseState | null,
  ) {}

  updateSettings(settings: Settings): void {
    this.settings = settings;
  }

  private rules(): PageRule[] {
    // user rules first, verified ones before hypotheses
    const user = [...this.settings.pageRules].sort((a, b) => (a.status === b.status ? 0 : a.status === 'verified' ? -1 : 1));
    return [...user, ...DEFAULT_PAGE_RULES];
  }

  getContext(): X3PageContext {
    const url = location.href;
    const title = document.title;
    const match = applyPageRules(url, title, this.rules());
    const env = environmentForUrl(this.settings.environments, url);

    let isX3: Sourced<boolean>;
    if (env) isX3 = known(true, 'config', 'EXACT', `page origin matches environment "${env.name}"`);
    else if (match.marksX3) isX3 = known(true, 'url', confidenceOf(match.marksX3.status), `URL rule ${match.marksX3.ruleId}`);
    else isX3 = unknown('page matches neither a configured environment nor an X3 URL rule');

    const fromRule = (g: PageGroup): Sourced<string> => ruleValue(match, g);
    const dataset = fromRule('dataset');
    const configFolder = env?.folder ? known(env.folder.toUpperCase(), 'config', 'EXACT', `environment "${env.name}"`) : undefined;
    const urlFolder = fromRule('folder');
    const folder: Sourced<string> =
      configFolder ??
      (urlFolder.value
        ? urlFolder
        : unknown<string>(
            dataset.value
              ? `server folder is not in the URL; endpoint dataset is ${dataset.value} (often the same, not always: e.g. dataset RECETTE / folder REC)`
              : 'no folder found',
          ));
    const functionCode = fromRule('function');
    const session = readSessionInfo();

    return {
      url,
      title,
      detectedAt: new Date().toISOString(),
      isX3,
      dataset,
      folder,
      functionCode,
      object: this.objectValue(fromRule('object')),
      window: this.windowValue(fromRule('window')),
      screen: this.screenValue(fromRule('screen')),
      session,
      signature: [url, title, functionCode.value ?? '', session.screenTitle.value ?? ''].join('|'),
      signals: match.signals,
    };
  }

  private objectValue(fallback: Sourced<string>): Sourced<string> {
    const w = this.syracuse?.currentWindow ?? null;
    const o = this.syracuse?.dictionary(w)?.object;
    return o ? known(o, 'syracuse', 'EXACT', `$prototype.$object of window ${w}`) : fallback;
  }

  private windowValue(fallback: Sourced<string>): Sourced<string> {
    const w = this.syracuse?.currentWindow;
    return w ? known(w, 'syracuse', 'EXACT', 'window opened by the Syracuse session ($sessions response)') : fallback;
  }

  private screenValue(fallback: Sourced<string>): Sourced<string> {
    const f = this.syracuse?.lastFocus;
    const info = f ? this.syracuse?.fieldInfo(f.field) : null;
    return info?.screen
      ? known(info.screen, 'syracuse', 'EXACT', `screen of the field under the cursor (${info.x3Name})`)
      : fallback;
  }

  fieldElementFrom(target: Element): Element | null {
    return fieldElementFrom(target);
  }

  inspectElement(element: Element, focus?: SyracuseFieldRef | null): FieldInspection {
    const dom = buildSnapshot(element);
    const inspection: FieldInspection = {
      id: crypto.randomUUID(),
      inspectedAt: new Date().toISOString(),
      label: findLabel(element),
      displayedValue: readValue(element),
      candidates: extractCandidates(dom.element, dom.parents),
      dom,
    };
    const hints = readUiHints(element);
    if (hints) inspection.uiHints = hints;
    const byFocus = focus ? this.syracuse?.fieldInfo(focus) : null;
    const syracuse =
      byFocus ??
      this.syracuse?.matchByClues({
        label: inspection.label.value,
        uiType: hints?.uiType.value ?? null,
        maxLength: hints?.maxLength.value ?? null,
      });
    if (syracuse) inspection.syracuse = syracuse;
    const props = syracuse ? this.syracuse?.propertiesOf({ win: syracuse.win, xid: syracuse.xid }) : null;
    if (props) inspection.x3Properties = props;
    return inspection;
  }

  observe(onChange: (ctx: X3PageContext) => void): () => void {
    let last = this.getContext().signature;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const ctx = this.getContext();
      if (ctx.signature !== last) {
        last = ctx.signature;
        onChange(ctx);
      }
    };
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(check, DEBOUNCE_MS);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { subtree: true, childList: true });
    const titleEl = document.querySelector('title');
    if (titleEl) mo.observe(titleEl, { childList: true, characterData: true, subtree: true });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);
    const poll = setInterval(check, POLL_MS); // URL changes without DOM mutation
    return () => {
      mo.disconnect();
      clearInterval(poll);
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('hashchange', schedule);
      window.removeEventListener('popstate', schedule);
    };
  }
}

function confidenceOf(status: PageRule['status']): 'EXACT' | 'INFERRED' {
  return status === 'verified' ? 'EXACT' : 'INFERRED';
}

function ruleValue(match: RuleMatchResult, g: PageGroup): Sourced<string> {
  const v = match.values[g];
  if (!v) return unknown(`no ${g} found by URL/title rules`);
  return known(v.value, 'url', confidenceOf(v.status), `rule ${v.ruleId} (${v.status})`);
}
