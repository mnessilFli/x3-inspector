import type { EnvironmentStatus, ExtensionEnvironment } from '@x3i/shared';
import type { SqlDialect } from '@x3i/x3-core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CompanionClient, errorMessage } from '../../lib/companionClient';
import { setDebug } from '../../lib/logger';
import { clearMetadataCache } from '../../lib/metadataCache';
import { DEFAULT_SETTINGS, loadSettings, loadToken, onSettingsChanged, saveSettings, saveToken, type Settings } from '../../lib/storage';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  update(patch: Partial<Settings>): Promise<void>;
  activeEnv: ExtensionEnvironment | null;
  /** Client for the active environment, null when none is configured. */
  client: CompanionClient | null;
  hasToken: boolean;
  setToken(companionUrl: string, token: string): Promise<void>;
  status: EnvironmentStatus | null;
  statusError: string | null;
  statusLoading: boolean;
  refreshStatus(): void;
  /** SQL dialect of the active environment database, undefined when unknown. */
  dialect: SqlDialect | undefined;
}

const Ctx = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [token, setTokenState] = useState<string | undefined>(undefined);
  const [tokenVersion, setTokenVersion] = useState(0);
  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusNonce, setStatusNonce] = useState(0);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setDebug(s.debug);
      setLoaded(true);
    });
    return onSettingsChanged((s) => {
      setSettings(s);
      setDebug(s.debug);
    });
  }, []);

  const activeEnv = useMemo(
    () => settings.environments.find((e) => e.id === settings.activeEnvId) ?? settings.environments[0] ?? null,
    [settings.environments, settings.activeEnvId],
  );

  useEffect(() => {
    if (!activeEnv) {
      setTokenState(undefined);
      return;
    }
    void loadToken(activeEnv.companionUrl).then(setTokenState);
  }, [activeEnv?.companionUrl, tokenVersion]);

  const client = useMemo(
    () => (activeEnv ? new CompanionClient(activeEnv.companionUrl, token, activeEnv.companionEnvId || undefined) : null),
    [activeEnv?.companionUrl, activeEnv?.companionEnvId, token],
  );

  useEffect(() => {
    clearMetadataCache();
    setStatus(null);
    setStatusError(null);
    if (!client) return;
    if (!client.hasToken) {
      setStatusError('No pairing token for this companion (TOOLS > Settings).');
      return;
    }
    if (!client.envId) {
      setStatusError('No companion environment id for this environment (TOOLS > Settings).');
      return;
    }
    let cancelled = false;
    setStatusLoading(true);
    client
      .status()
      .then((s) => !cancelled && setStatus(s))
      .catch((e: unknown) => !cancelled && setStatusError(errorMessage(e)))
      .finally(() => !cancelled && setStatusLoading(false));
    return () => {
      cancelled = true;
    };
  }, [client, statusNonce]);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      setDebug(next.debug);
      await saveSettings(next);
    },
    [settings],
  );

  const setToken = useCallback(async (companionUrl: string, value: string) => {
    await saveToken(companionUrl, value.trim());
    setTokenVersion((v) => v + 1);
  }, []);

  const value: SettingsState = {
    settings,
    loaded,
    update,
    activeEnv,
    client,
    hasToken: Boolean(token),
    setToken,
    status,
    statusError,
    statusLoading,
    refreshStatus: () => setStatusNonce((n) => n + 1),
    dialect: status?.environment.database?.type,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings outside SettingsProvider');
  return v;
}
