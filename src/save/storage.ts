/** Key-value storage adapters. Keys are short strings; values are strings (JSON). */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const PREFIX = "ia:";

/** Browser localStorage (also what the Capacitor WebView offers by default). */
export class WebStorage implements StorageAdapter {
  private readonly ls: Storage;
  constructor(ls: Storage = globalThis.localStorage) { this.ls = ls; }
  async get(key: string) { return this.ls.getItem(PREFIX + key); }
  async set(key: string, value: string) { this.ls.setItem(PREFIX + key, value); }
  async remove(key: string) { this.ls.removeItem(PREFIX + key); }
  async keys() {
    const out: string[] = [];
    for (let i = 0; i < this.ls.length; i++) { const k = this.ls.key(i)!; if (k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length)); }
    return out;
  }
}

/** In-memory adapter for tests and as a fallback when storage is unavailable (private mode). */
export class MemoryStorage implements StorageAdapter {
  readonly map = new Map<string, string>();
  /** Test hook: throw on the n-th write to simulate a crash mid-save. */
  failWriteAt = -1;
  private writes = 0;
  async get(key: string) { return this.map.get(key) ?? null; }
  async set(key: string, value: string) { if (++this.writes === this.failWriteAt) throw new Error("simulated write failure"); this.map.set(key, value); }
  async remove(key: string) { this.map.delete(key); }
  async keys() { return [...this.map.keys()]; }
}

/**
 * Capacitor Preferences adapter. Imported dynamically by app.ts only when running inside Capacitor,
 * so the web build has no dependency on it. Shape of the plugin: { get({key}) → {value}, set({key,value}), remove({key}), keys() → {keys} }.
 */
export class PreferencesStorage implements StorageAdapter {
  private readonly prefs: any;
  constructor(prefs: any) { this.prefs = prefs; }
  async get(key: string) { return (await this.prefs.get({ key: PREFIX + key })).value ?? null; }
  async set(key: string, value: string) { await this.prefs.set({ key: PREFIX + key, value }); }
  async remove(key: string) { await this.prefs.remove({ key: PREFIX + key }); }
  async keys() { return ((await this.prefs.keys()).keys as string[]).filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length)); }
}

export function pickStorage(): StorageAdapter {
  try {
    const ls = globalThis.localStorage;
    ls.setItem(PREFIX + "probe", "1"); ls.removeItem(PREFIX + "probe");
    return new WebStorage(ls);
  } catch { return new MemoryStorage(); }
}
