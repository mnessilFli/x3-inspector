import type { FieldInspection } from '@x3i/shared';
import type { SyracuseFieldRef } from '@x3i/x3-core';
import type { SyracusePageAdapter } from './adapter';
import { Overlay } from './overlay';
import type { SyracuseState } from './syracuseState';

const FOCUS_WAIT_MS = 1500;

/** Editable inputs get the click (X3 only moves the cursor), so Syracuse tells which field it is. */
function isEditableInput(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (!(el instanceof HTMLInputElement)) return false;
  return !el.readOnly && !el.disabled && !['button', 'submit', 'reset', 'image', 'file', 'hidden'].includes(el.type);
}

/**
 * Inspect mode: hovered fields are outlined. A click on an editable input is passed to X3, which
 * only moves the cursor into the field and tells its server which field it is (exact name). Any other
 * click is captured (X3 never receives it). Esc leaves the mode.
 */
export class InspectMode {
  private active = false;
  private readonly overlay = new Overlay();
  private hovered: Element | null = null;
  private selected: Element | null = null;

  constructor(
    private readonly adapter: SyracusePageAdapter,
    private readonly syracuse: SyracuseState | null,
    private readonly onInspect: (inspection: FieldInspection) => void,
    private readonly onStateChange: (active: boolean) => void,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  set(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (active) {
      this.overlay.mount();
      this.overlay.showBanner(true);
      window.addEventListener('mousemove', this.onMove, true);
      for (const t of BLOCKED) window.addEventListener(t, this.onBlocked, true);
      window.addEventListener('click', this.onClick, true);
      window.addEventListener('keydown', this.onKey, true);
      window.addEventListener('scroll', this.onScroll, true);
    } else {
      window.removeEventListener('mousemove', this.onMove, true);
      for (const t of BLOCKED) window.removeEventListener(t, this.onBlocked, true);
      window.removeEventListener('click', this.onClick, true);
      window.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('scroll', this.onScroll, true);
      this.hovered = null;
      this.overlay.highlight(null);
      this.overlay.showBanner(false);
    }
    this.onStateChange(active);
  }

  private readonly onMove = (e: MouseEvent) => {
    const t = e.target instanceof Element ? this.adapter.fieldElementFrom(e.target) : null;
    if (t === this.hovered) return;
    this.hovered = t;
    this.overlay.highlight(t);
  };

  private readonly onBlocked = (e: Event) => {
    if (e.target instanceof Element && isEditableInput(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  private readonly onClick = (e: MouseEvent) => {
    const raw = e.target instanceof Element ? e.target : null;
    const t = raw ? this.adapter.fieldElementFrom(raw) : null;
    const passThrough = raw !== null && isEditableInput(raw);
    if (!passThrough) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    if (!t) return;
    this.selected = t;
    this.overlay.select(t);
    if (!passThrough || !this.syracuse) {
      this.onInspect(this.adapter.inspectElement(t));
      return;
    }
    const clickedAt = Date.now() - 50;
    void this.syracuse.waitForFocus(clickedAt, FOCUS_WAIT_MS).then((f) => {
      // no message when the cursor was already in this field: the last focus is then this field
      const ref: SyracuseFieldRef | null = f?.field ?? (document.activeElement === raw ? (this.syracuse?.lastFocus?.field ?? null) : null);
      this.onInspect(this.adapter.inspectElement(t, ref));
    });
  };

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.set(false);
    }
  };

  private readonly onScroll = () => {
    this.overlay.highlight(this.hovered);
    this.overlay.select(this.selected);
  };
}

const BLOCKED = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'] as const;
