import { createLogger, setDebug } from '../lib/logger';
import { emitRuntimeEvent, isContentRequest, type InspectStateResponse, type PingResponse } from '../lib/messages';
import { DEFAULT_SETTINGS, loadSettings, onSettingsChanged } from '../lib/storage';
import { SyracusePageAdapter } from './adapter';
import { InspectMode } from './inspectMode';
import { Launcher } from './launcher';
import { runSessionGraphql } from './graphql';
import { SyracuseState } from './syracuseState';
import { fieldElementFrom } from './dom';

declare global {
  interface Window {
    __x3InspectorLoaded?: boolean;
  }
}

const log = createLogger('content');

function start(): void {
  // registered content script + manual injection may both run: keep a single instance per frame
  if (window.__x3InspectorLoaded) return;
  window.__x3InspectorLoaded = true;

  const isTop = window.top === window;
  const syracuse = isTop ? new SyracuseState() : null;
  const adapter = new SyracusePageAdapter(DEFAULT_SETTINGS, syracuse);
  const inspect = new InspectMode(
    adapter,
    syracuse,
    (inspection) => {
      log.debug('field inspected', inspection.candidates.slice(0, 3));
      emitRuntimeEvent({ type: 'field-inspected', inspection });
    },
    (active) => emitRuntimeEvent({ type: 'inspect-state', active }),
  );

  void loadSettings().then((s) => {
    adapter.updateSettings(s);
    setDebug(s.debug);
  });
  onSettingsChanged((s) => {
    adapter.updateSettings(s);
    setDebug(s.debug);
  });

  if (isTop) {
    const launcher = new Launcher(async () => {
      try {
        const r = (await chrome.runtime.sendMessage({ type: 'open-side-panel' })) as { ok?: boolean } | undefined;
        return r?.ok === true;
      } catch {
        return false;
      }
    });
    const syncLauncher = (isX3: boolean) => (isX3 ? launcher.show() : launcher.hide());
    syncLauncher(adapter.getContext().isX3.value === true);
    // Follow the X3 cursor: every field entered in X3 is sent to the panel (without switching its tab).
    // The DOM side comes from the last input that received focus (document.activeElement may already
    // point elsewhere when Syracuse sends its message).
    let lastInput: { el: Element; at: number } | null = null;
    document.addEventListener(
      'focusin',
      (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) lastInput = { el: t, at: Date.now() };
      },
      true,
    );
    // Esc + F6 in X3: the properties window content is attached to the field and sent again
    syracuse?.onProperties((field) => {
      const el = lastInput?.el.isConnected ? fieldElementFrom(lastInput.el) : null;
      if (!el) return;
      const inspection = adapter.inspectElement(el, field);
      inspection.auto = true;
      emitRuntimeEvent({ type: 'field-inspected', inspection });
    });
    syracuse?.onFocus((f) => {
      if (inspect.isActive) return; // inspect mode builds its own inspection
      const recent = lastInput && lastInput.el.isConnected && f.at - lastInput.at < 3000 ? lastInput.el : null;
      const el = recent ? fieldElementFrom(recent) : null;
      if (!el) return;
      const inspection = adapter.inspectElement(el, f.field);
      inspection.auto = true;
      emitRuntimeEvent({ type: 'field-inspected', inspection });
      emitRuntimeEvent({ type: 'context-changed', context: adapter.getContext() });
    });
    adapter.observe((context) => {
      log.debug('context changed', context.signature);
      syncLauncher(context.isX3.value === true);
      emitRuntimeEvent({ type: 'context-changed', context });
    });
  }

  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (!isContentRequest(msg)) return false;
    switch (msg.type) {
      case 'ping': {
        const r: PingResponse = { ok: true, frameUrl: location.href, isTopFrame: isTop, inspecting: inspect.isActive };
        sendResponse(r);
        return false;
      }
      case 'get-context':
        // only the top frame describes the page
        if (!isTop) return false;
        sendResponse(adapter.getContext());
        return false;
      case 'set-inspect':
        inspect.set(msg.active);
        if (isTop) sendResponse({ inspecting: inspect.isActive } satisfies InspectStateResponse);
        return false;
      case 'get-syracuse-debug':
        if (!isTop) return false;
        sendResponse(syracuse?.debug() ?? null);
        return false;
      case 'graphql':
        if (!isTop) return false;
        void runSessionGraphql(msg.query, msg.variables).then(sendResponse);
        return true; // async answer
      case 'toggle-inspect':
        inspect.set(!inspect.isActive);
        if (isTop) sendResponse({ inspecting: inspect.isActive } satisfies InspectStateResponse);
        return false;
    }
  });

  log.debug(`content script ready (${isTop ? 'top frame' : 'sub frame'})`);
}

start();
