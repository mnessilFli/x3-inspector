import { known, unknown, type FieldUiHints, type PageSessionInfo, type Sourced } from '@x3i/shared';

/**
 * Syracuse-specific DOM readers. Selectors verified on a real page (X3 Cloud V12,
 * snouestboissons.em.cloud-by-sage.fr, function GESBPC, 2026-10-02):
 *   <article id="s_app" data-s-endpoint="Pré-Prod" data-s-role="..." data-s-local="français (France) fr-FR">
 *   <h1 class="s_page_header_title"><span title="Client">Client</span></h1>
 *   <div id="layout-slot-1-134" class="s-slot-inline ... s-field-type-x-reference ...">
 *     ... <div class="s-field-value-edit s-mandatory"> <input class="s-field-input" maxlength="3">
 * Syracuse does NOT put the technical field name (BPCNUM) in these attributes.
 */

function attrOf(el: Element | null, name: string, where: string): Sourced<string> {
  const v = el?.getAttribute(name)?.trim();
  return v ? known(v, 'dom', 'EXACT', `${where}[${name}]`) : unknown(`${where}[${name}] not found`);
}

export function readSessionInfo(): PageSessionInfo {
  const app = document.getElementById('s_app');
  const titleEl = document.querySelector('h1.s_page_header_title span[title]') ?? document.querySelector('h1.s_page_header_title');
  const title = titleEl?.getAttribute('title')?.trim() || titleEl?.textContent?.trim();
  return {
    endpoint: attrOf(app, 'data-s-endpoint', '#s_app'),
    role: attrOf(app, 'data-s-role', '#s_app'),
    locale: attrOf(app, 'data-s-local', '#s_app'),
    screenTitle: title ? known(title, 'dom', 'EXACT', 'h1.s_page_header_title') : unknown('page header title not found'),
  };
}

export function readUiHints(el: Element): FieldUiHints | undefined {
  const slot = el.closest('[id^="layout-slot-"]');
  if (!slot) return undefined;
  const typeClass = Array.from(slot.classList).find((c) => c.startsWith('s-field-type-'));
  const valueEdit = el.closest('.s-field-value-edit') ?? slot.querySelector('.s-field-value-edit');
  const input = el instanceof HTMLInputElement ? el : slot.querySelector('input.s-field-input');
  const max = input?.getAttribute('maxlength');
  return {
    mandatory: valueEdit
      ? valueEdit.classList.contains('s-mandatory')
        ? known(true, 'dom', 'EXACT', 'class s-mandatory')
        : known(false, 'dom', 'INFERRED', 'class s-mandatory absent')
      : unknown('field container .s-field-value-edit not found'),
    uiType: typeClass ? known(typeClass.slice('s-field-type-'.length), 'dom', 'EXACT', `class ${typeClass}`) : unknown('no s-field-type-* class'),
    maxLength: max && /^\d+$/.test(max) ? known(Number(max), 'dom', 'EXACT', 'input maxlength') : unknown('no maxlength attribute'),
  };
}
