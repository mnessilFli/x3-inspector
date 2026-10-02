import { matchPatternOf } from '../lib/env';
import { createLogger, setDebug } from '../lib/logger';
import { isOpenPanelRequest, sendToAllFrames } from '../lib/messages';
import { loadSettings, onSettingsChanged, type Settings } from '../lib/storage';

const log = createLogger('background');
const CONTENT_SCRIPT_ID = 'x3i-content';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e: unknown) => log.warn('setPanelBehavior failed', String(e)));

/** Match patterns of configured X3 environments for which the user granted host access. */
async function grantedPatterns(settings: Settings): Promise<string[]> {
  const patterns = [...new Set(settings.environments.map((e) => matchPatternOf(e.x3Url)).filter((p): p is string => p !== undefined))];
  const granted: string[] = [];
  for (const p of patterns) {
    if (await chrome.permissions.contains({ origins: [p] })) granted.push(p);
  }
  return granted;
}

let syncing: Promise<void> = Promise.resolve();

/** (Re)registers the content script on the granted X3 origins. Serialized to avoid duplicate ids. */
function syncContentScripts(): Promise<void> {
  syncing = syncing.then(async () => {
    try {
      const settings = await loadSettings();
      setDebug(settings.debug);
      const matches = await grantedPatterns(settings);
      const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
      if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
      if (matches.length === 0) {
        log.debug('no granted X3 origin: content script not registered');
        return;
      }
      await chrome.scripting.registerContentScripts([
        { id: CONTENT_SCRIPT_ID, js: ['content.js'], matches, allFrames: true, runAt: 'document_idle', persistAcrossSessions: true },
      ]);
      log.debug('content script registered', matches);
    } catch (e) {
      log.warn('content script sync failed', String(e));
    }
  });
  return syncing;
}

chrome.runtime.onInstalled.addListener(() => void syncContentScripts());
chrome.runtime.onStartup.addListener(() => void syncContentScripts());
chrome.permissions.onAdded.addListener(() => void syncContentScripts());
chrome.permissions.onRemoved.addListener(() => void syncContentScripts());
onSettingsChanged(() => void syncContentScripts());

// Launcher button on X3 pages. sidePanel.open must be called synchronously in the click's user gesture.
chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  if (!isOpenPanelRequest(msg)) return false;
  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    sendResponse({ ok: false });
    return false;
  }
  chrome.sidePanel
    .open({ windowId })
    .then(() => sendResponse({ ok: true }))
    .catch((e: unknown) => {
      log.warn('sidePanel.open from launcher failed', String(e));
      sendResponse({ ok: false });
    });
  return true;
});

chrome.commands.onCommand.addListener((command, tab) => {
  // sidePanel.open must run synchronously inside the user gesture: no await before it.
  if (tab?.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((e: unknown) => log.warn('sidePanel.open failed', String(e)));
  }
  if (command === 'inspect-field' && tab?.id !== undefined) {
    void sendToAllFrames(tab.id, { type: 'toggle-inspect' });
  }
});
