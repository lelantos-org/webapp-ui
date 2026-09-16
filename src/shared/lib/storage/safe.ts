// Web storage that cannot throw.
//
// `localStorage` and `sessionStorage` fail in several ways: Safari in private
// mode throws on access to the property rather than only on write, a sandboxed
// iframe throws `SecurityError` on the same, and `setItem` throws
// `QuotaExceededError` once the origin's budget is spent. Handling that once
// here keeps every call site from carrying its own try/catch.
//
// Storage here is always a cache or a preference, never a source of truth, so
// unavailable and absent are the same answer and both are `undefined`. Writes
// are best-effort and report whether they landed.

import { createLogger } from "@/shared/lib/logger";

const log = createLogger("storage");

export type StorageKind = "local" | "session";

/// Resolve the backing store, or `undefined` where it is unavailable.
///
/// Both the presence check and the try/catch are needed: the first covers SSR and
/// test environments where the global is missing, the second covers browsers that
/// define it and throw on access.
function backing(kind: StorageKind): Storage | undefined {
  try {
    const store = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    return store ?? undefined;
  } catch {
    return undefined;
  }
}

export interface SafeStorage {
  /// `undefined` for a missing key and for unavailable storage.
  get(key: string): string | undefined;
  /// `false` when the write could not be made (quota, private mode).
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /// Every key starting with `prefix`. Snapshotted before use, so a caller may
  /// remove entries while iterating the result.
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

/// Read a JSON value, or `undefined` when it is missing, unreadable or does not
/// satisfy `isValid`.
///
/// The guard is required: stored JSON is untrusted input — written by an older
/// build, hand-edited, or truncated mid-write — and without it the parse result
/// is typed on assumption alone.
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

export function writeJson(store: SafeStorage, key: string, value: unknown): boolean {
  try {
    return store.set(key, JSON.stringify(value));
  } catch (e) {
    log.warn("unserialisable value for storage key", key, e);
    return false;
  }
}
