/**
 * Small "X3" tab on the right edge of Sage X3 pages (like Salesforce Inspector). A click asks the
 * service worker to open the side panel. Drawn in a closed shadow root so X3 styles never interfere.
 */
export class Launcher {
  private host: HTMLElement | undefined;
  private hint: HTMLElement | undefined;

  constructor(private readonly onOpen: () => Promise<boolean>) {}

  show(): void {
    if (this.host?.isConnected) return;
    const host = document.createElement('x3i-launcher');
    host.style.cssText = 'all: initial; position: fixed; top: 40%; right: 0; z-index: 2147483646;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 4px;
        font: 600 12px/1 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #fff; background: #032d60;
        padding: 10px 6px 10px 8px; border-radius: 8px 0 0 8px; box-shadow: -1px 1px 4px rgba(0,0,0,.35);
        writing-mode: vertical-rl; transform: rotate(180deg); opacity: .85; }
      button:hover, button:focus-visible { opacity: 1; background: #0176d3; }
      .hint { position: absolute; right: 34px; top: 0; width: 220px; display: none; writing-mode: horizontal-tb;
        font: 12px/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #181818; background: #fff;
        border: 1px solid #c9c9c9; border-radius: 6px; padding: 8px; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
    `;
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Open X3 Inspector (Alt+X)';
    button.textContent = 'X3 Inspector';
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Chrome refused to open the panel from the page: click the X3 Inspector icon in the toolbar (puzzle icon > pin it).';
    button.addEventListener('click', () => {
      void this.onOpen().then((ok) => {
        hint.style.display = ok ? 'none' : 'block';
        if (!ok) setTimeout(() => (hint.style.display = 'none'), 6000);
      });
    });
    root.append(style, button, hint);
    document.documentElement.appendChild(host);
    this.host = host;
    this.hint = hint;
  }

  hide(): void {
    this.host?.remove();
    this.host = undefined;
    this.hint = undefined;
  }
}
