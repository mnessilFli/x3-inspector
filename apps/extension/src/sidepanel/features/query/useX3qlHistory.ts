import { useEffect, useState } from 'react';

const KEY = 'x3i.x3qlHistory';
const MAX = 30;

/** Last X3QL queries run (chrome.storage.local, text only). */
export function useX3qlHistory() {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    void chrome.storage.local.get(KEY).then((r) => setItems((r[KEY] as string[] | undefined) ?? []));
  }, []);
  const push = async (q: string) => {
    const next = [q, ...items.filter((x) => x !== q)].slice(0, MAX);
    setItems(next);
    await chrome.storage.local.set({ [KEY]: next });
  };
  return { items, push };
}
