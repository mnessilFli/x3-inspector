import type { FieldInspection, X3PageContext } from '@x3i/shared';

/**
 * Understands the X3 page currently open. The element type is generic so this package stays free
 * of DOM typings (it is also used by the Node companion). The extension implements
 * X3PageAdapter<Element>.
 */
export interface X3PageAdapter<TElement = unknown> {
  readonly id: string;
  /** Current page context with provenance for every value. */
  getContext(): X3PageContext;
  /** Field information for an element clicked in Inspect mode. */
  inspectElement(element: TElement): FieldInspection;
  /** Picks the element that best represents a field from the raw event target. */
  fieldElementFrom(target: TElement): TElement | null;
  /** Calls back when the context signature changes (function, tab, URL). Returns an unsubscribe function. */
  observe(onChange: (ctx: X3PageContext) => void): () => void;
}
