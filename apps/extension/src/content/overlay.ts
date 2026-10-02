/** Highlight boxes drawn in a closed shadow root so X3 styles never leak in or out. */
export class Overlay {
  private readonly host: HTMLElement;
  private readonly hover: HTMLElement;
  private readonly selected: HTMLElement;
  private readonly banner: HTMLElement;

  constructor() {
    this.host = document.createElement('x3i-overlay');
    this.host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
    const root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .box { position: fixed; pointer-events: none; box-sizing: border-box; border-radius: 3px; display: none; }
      .hover { outline: 2px solid #0176d3; background: rgba(1, 118, 211, 0.08); }
      .selected { outline: 2px solid #2e844a; background: rgba(46, 132, 74, 0.08); }
      .banner { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); display: none;
        font: 12px/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #fff; background: #032d60;
        padding: 6px 12px; border-radius: 14px; box-shadow: 0 2px 6px rgba(0,0,0,.3); }
    `;
    this.hover = this.box('hover');
    this.selected = this.box('selected');
    this.banner = document.createElement('div');
    this.banner.className = 'banner';
    this.banner.textContent = 'X3 Inspector · click a field to inspect it · Esc to exit';
    root.append(style, this.hover, this.selected, this.banner);
  }

  private box(cls: string): HTMLElement {
    const d = document.createElement('div');
    d.className = `box ${cls}`;
    return d;
  }

  mount(): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
  }

  unmount(): void {
    this.host.remove();
  }

  showBanner(show: boolean): void {
    this.banner.style.display = show && window.top === window ? 'block' : 'none';
  }

  highlight(el: Element | null): void {
    place(this.hover, el);
  }

  select(el: Element | null): void {
    place(this.selected, el);
  }
}

function place(box: HTMLElement, el: Element | null): void {
  if (!el) {
    box.style.display = 'none';
    return;
  }
  const r = el.getBoundingClientRect();
  box.style.display = 'block';
  box.style.left = `${r.left - 2}px`;
  box.style.top = `${r.top - 2}px`;
  box.style.width = `${r.width + 4}px`;
  box.style.height = `${r.height + 4}px`;
}
