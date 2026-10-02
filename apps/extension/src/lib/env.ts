import type { ExtensionEnvironment } from '@x3i/shared';

/** Origin of a URL, or undefined when the URL is invalid. */
export function originOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Chrome match pattern for a URL. Match patterns cannot carry a port: http://x3srv:8124 -> http://x3srv/*
 * (the permission then covers every port of that host).
 */
export function matchPatternOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return undefined;
  }
}

/** Environment whose X3 URL has the same origin as the page. */
export function environmentForUrl(envs: ExtensionEnvironment[], pageUrl: string): ExtensionEnvironment | undefined {
  const o = originOf(pageUrl);
  if (!o) return undefined;
  return envs.find((e) => e.x3Url && originOf(e.x3Url) === o);
}

export async function hasHostPermission(url: string): Promise<boolean> {
  const pattern = matchPatternOf(url);
  if (!pattern) return false;
  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

/** Must be called from a user gesture (button click). */
export async function requestHostPermission(url: string): Promise<boolean> {
  const pattern = matchPatternOf(url);
  if (!pattern) return false;
  return chrome.permissions.request({ origins: [pattern] });
}
