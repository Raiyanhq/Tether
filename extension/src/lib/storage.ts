// Thin wrapper over chrome.storage with an in-memory fallback (tests, plain-browser dev).
export type Area = "local" | "sync" | "session";

const mem: Record<Area, Record<string, unknown>> = { local: {}, sync: {}, session: {} };
const listeners: Record<Area, Map<string, Set<(v: unknown) => void>>> = {
  local: new Map(), sync: new Map(), session: new Map(),
};

const hasChrome = () => typeof chrome !== "undefined" && !!chrome.storage?.[("local")];
const areaOf = (a: Area) => (chrome.storage as unknown as Record<Area, chrome.storage.StorageArea>)[a];

export async function getItem<T>(area: Area, key: string, fallback: T): Promise<T> {
  if (!hasChrome() || !areaOf(area)) return (mem[area][key] as T) ?? fallback;
  const res = await areaOf(area).get(key);
  return (res[key] as T) ?? fallback;
}

export async function setItem(area: Area, key: string, value: unknown): Promise<void> {
  if (!hasChrome() || !areaOf(area)) {
    mem[area][key] = value;
    listeners[area].get(key)?.forEach((cb) => cb(value));
    return;
  }
  await areaOf(area).set({ [key]: value });
}

export async function removeItem(area: Area, key: string): Promise<void> {
  if (!hasChrome() || !areaOf(area)) { delete mem[area][key]; return; }
  await areaOf(area).remove(key);
}

/** Subscribe to changes of one key. Returns an unsubscribe function. */
export function onItemChange<T>(area: Area, key: string, cb: (v: T | undefined) => void): () => void {
  if (!hasChrome() || !areaOf(area)) {
    const set = listeners[area].get(key) ?? new Set();
    set.add(cb as (v: unknown) => void);
    listeners[area].set(key, set);
    return () => set.delete(cb as (v: unknown) => void);
  }
  const handler = (changes: Record<string, chrome.storage.StorageChange>, name: string) => {
    if (name === area && key in changes) cb(changes[key].newValue as T | undefined);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
