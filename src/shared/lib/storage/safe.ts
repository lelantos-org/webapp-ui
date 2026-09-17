import { createLogger } from "@/shared/lib/logger";

const log = createLogger("storage");

export type StorageKind = "local" | "session";

/// The backing store, or `undefined` where it is missing or throws on access.
function backing(kind: StorageKind): Storage | undefined {
  try {
    const store = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    return store ?? undefined;
  } catch {
    return undefined;
  }
}

/// Web storage that never throws; unavailable reads as absent.
export interface SafeStorage {
  /// `undefined` for a missing key and for unavailable storage.
  get(key: string): string | undefined;
  /// `false` when the write could not be made (quota, private mode).
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /// Every key starting with `prefix`, snapshotted so the caller may remove while iterating.
  keys(prefix: string): string[];
  /// Remove every key starting with `prefix`.
  removePrefix(prefix: string): void;
}

function make(kind: StorageKind): SafeStorage {
  return {
    get(key) {
      try {
        return backing(kind)?.getItem(key) ?? undefined;
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      try {
        const store = backing(kind);
        if (!store) return false;
        store.setItem(key, value);
        return true;
      } catch (e) {
        log.warn(`could not write ${kind}Storage key`, key, e);
        return false;
      }
    },
    remove(key) {
      try {
        backing(kind)?.removeItem(key);
      } catch {
        // Nothing to do: the entry is unreachable either way.
      }
    },
    keys(prefix) {
      try {
        const store = backing(kind);
        if (!store) return [];
        const out: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key?.startsWith(prefix)) out.push(key);
        }
        return out;
      } catch {
        return [];
      }
    },
    removePrefix(prefix) {
      for (const key of this.keys(prefix)) this.remove(key);
    },
  };
}

export const localStore: SafeStorage = make("local");
export const sessionStore: SafeStorage = make("session");

/// Read a JSON value, or `undefined` when missing, unparseable or rejected by `isValid`.
export function readJson<T>(
  store: SafeStorage,
  key: string,
  isValid: (value: unknown) => value is T,
): T | undefined {
  const raw = store.get(key);
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : undefined;
  } catch {
    log.warn("unparseable JSON in storage; ignoring", key);
    return undefined;
  }
}

/// Write a JSON value; `false` when it could not be serialised or stored.
export function writeJson(store: SafeStorage, key: string, value: unknown): boolean {
  try {
    return store.set(key, JSON.stringify(value));
  } catch (e) {
    log.warn("unserialisable value for storage key", key, e);
    return false;
  }
}
