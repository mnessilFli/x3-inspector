import type { PingResponse } from './messages';
import { sendToTopFrame } from './messages';

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** True when our content script answers in the tab's top frame. */
export async function pingTab(tabId: number): Promise<PingResponse | undefined> {
  return sendToTopFrame<PingResponse>(tabId, { type: 'ping' });
}

/** Injects the content script in all frames (requires host permission on the tab's site). */
export async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
}

/** Makes sure the content script runs in the tab: ping, inject if needed, ping again. */
export async function ensureContentScript(tabId: number): Promise<boolean> {
  if (await pingTab(tabId)) return true;
  try {
    await injectContentScript(tabId);
  } catch {
    return false;
  }
  return (await pingTab(tabId)) !== undefined;
}
