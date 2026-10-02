import type { FieldInspection, X3PageContext } from '@x3i/shared';
import type { PageResolution } from '@x3i/x3-core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../../lib/companionClient';
import { createLogger } from '../../lib/logger';
import { isRuntimeEvent, sendToAllFrames, sendToTopFrame, type InspectStateResponse } from '../../lib/messages';
import { ensureContentScript, getActiveTab, pingTab } from '../../lib/tabs';
import { useSettings } from './SettingsContext';
import { effectiveContext, resolutionInputKey, type ContextKey, type EffectiveContext, type Overrides } from './pageModel';

const log = createLogger('page');

export type ContentStatus = 'unknown' | 'ready' | 'unavailable';

interface PageState {
  tabId: number | null;
  context: X3PageContext | null;
  resolution: PageResolution | null;
  effective: EffectiveContext;
  overrides: Overrides;
  setOverride(key: ContextKey, value: string | null): void;
  contentStatus: ContentStatus;
  loading: boolean;
  error: string | null;
  resolveError: string | null;
  inspectScreen(): Promise<void>;
  inspecting: boolean;
  setInspecting(active: boolean): Promise<void>;
  inspection: FieldInspection | null;
}

const Ctx = createContext<PageState | null>(null);

export function PageProvider({ children }: { children: ReactNode }) {
  const { client } = useSettings();
  const [tabId, setTabId] = useState<number | null>(null);
  const tabRef = useRef<number | null>(null);
  const [context, setContext] = useState<X3PageContext | null>(null);
  const [resolution, setResolution] = useState<PageResolution | null>(null);
  const [overridesByTab, setOverridesByTab] = useState<Record<number, Overrides>>({});
  const [contentStatus, setContentStatus] = useState<ContentStatus>('unknown');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [inspecting, setInspectingState] = useState(false);
  const [inspection, setInspection] = useState<FieldInspection | null>(null);

  const switchTab = useCallback((id: number | null) => {
    tabRef.current = id;
    setTabId(id);
    setContext(null);
    setResolution(null);
    setError(null);
    setInspectingState(false);
    setContentStatus('unknown');
    if (id === null) return;
    // silent attempt: only if the content script is already there
    void pingTab(id).then(async (p) => {
      if (!p || tabRef.current !== id) return;
      setContentStatus('ready');
      setInspectingState(p.inspecting);
      const ctx = await sendToTopFrame<X3PageContext>(id, { type: 'get-context' });
      if (ctx && tabRef.current === id) setContext(ctx);
    });
  }, []);

  useEffect(() => {
    let windowId: number | undefined;
    void chrome.windows.getCurrent().then((w) => (windowId = w.id));
    void getActiveTab().then((t) => switchTab(t?.id ?? null));
    const onActivated = (info: { tabId: number; windowId: number }) => {
      if (windowId === undefined || info.windowId === windowId) switchTab(info.tabId);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    const onMessage = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if (!isRuntimeEvent(msg)) return;
      const from = sender.tab?.id;
      if (from === undefined) return;
      if (tabRef.current === null) {
        tabRef.current = from;
        setTabId(from);
      }
      if (from !== tabRef.current) return;
      if (msg.type === 'context-changed') setContext(msg.context);
      else if (msg.type === 'field-inspected') setInspection(msg.inspection);
      else if (msg.type === 'inspect-state') setInspectingState(msg.active);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [switchTab]);

  const overrides = useMemo(() => (tabId !== null ? (overridesByTab[tabId] ?? {}) : {}), [overridesByTab, tabId]);
  const effective = useMemo(() => effectiveContext(context, resolution, overrides), [context, resolution, overrides]);

  // the resolution depends on detected / overridden function, object, screen only
  const preResolution = useMemo(() => effectiveContext(context, null, overrides), [context, overrides]);
  const inputKey = resolutionInputKey(preResolution);
  useEffect(() => {
    setResolveError(null);
    if (!context && !overrides.functionCode && !overrides.object) {
      setResolution(null);
      return;
    }
    if (!client || !client.hasToken || !client.envId) {
      setResolution(null);
      setResolveError('Companion not configured: main table cannot be resolved.');
      return;
    }
    let cancelled = false;
    client
      .resolvePage({ functionCode: preResolution.functionCode.value, object: preResolution.object.value, screen: preResolution.screen.value })
      .then((r) => !cancelled && setResolution(r))
      .catch((e: unknown) => {
        if (cancelled) return;
        setResolution(null);
        setResolveError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
    // deliberately keyed on the resolution input only
  }, [inputKey, client, context === null]);

  const setOverride = useCallback(
    (key: ContextKey, value: string | null) => {
      if (tabId === null) return;
      setOverridesByTab((prev) => {
        const cur = { ...(prev[tabId] ?? {}) };
        if (value === null || !value.trim()) delete cur[key];
        else cur[key] = value;
        return { ...prev, [tabId]: cur };
      });
    },
    [tabId],
  );

  const inspectScreen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tab = await getActiveTab();
      if (tab?.id === undefined) throw new Error('No active tab.');
      if (tab.id !== tabRef.current) {
        tabRef.current = tab.id;
        setTabId(tab.id);
      }
      const ok = await ensureContentScript(tab.id);
      setContentStatus(ok ? 'ready' : 'unavailable');
      if (!ok) {
        setContext(null);
        return;
      }
      const ctx = await sendToTopFrame<X3PageContext>(tab.id, { type: 'get-context' });
      if (!ctx) throw new Error('The page did not answer (top frame).');
      log.debug('context', ctx);
      setContext(ctx);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const setInspecting = useCallback(async (active: boolean) => {
    setError(null);
    const tab = await getActiveTab();
    if (tab?.id === undefined) return;
    if (tab.id !== tabRef.current) {
      tabRef.current = tab.id;
      setTabId(tab.id);
    }
    const ok = await ensureContentScript(tab.id);
    setContentStatus(ok ? 'ready' : 'unavailable');
    if (!ok) return;
    const r = await sendToAllFrames<InspectStateResponse>(tab.id, { type: 'set-inspect', active });
    setInspectingState(r?.inspecting ?? active);
  }, []);

  const value: PageState = {
    tabId,
    context,
    resolution,
    effective,
    overrides,
    setOverride,
    contentStatus,
    loading,
    error,
    resolveError,
    inspectScreen,
    inspecting,
    setInspecting,
    inspection,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePage(): PageState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePage outside PageProvider');
  return v;
}
