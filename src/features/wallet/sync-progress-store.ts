import { useSyncExternalStore } from "react";

export interface SyncProgress {
  /// `true` while a sync is running and has counts worth showing.
  active: boolean;
  /// Encrypted notes fetched and trial-decrypted so far this sync.
  scanned: number;
  /// Of those, the ones belonging to this wallet.
  hits: number;
}

const IDLE: SyncProgress = { active: false, scanned: 0, hits: 0 };

let snapshot: SyncProgress = IDLE;
const listeners = new Set<() => void>();

/// Which sync owns the counter right now.
///
/// The store is a module singleton with one counter, but syncs overlap: a chain
/// switch starts a new sync while the previous one is still paging. Without an
/// owner, the older sync's `finished()` would zero the live counter mid-flight,
/// which is what distinguishes a long sync from a hang. Late emissions from a
/// superseded owner are ignored.
let owner: string | undefined;

function emit(next: SyncProgress): void {
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getSnapshot = (): SyncProgress => snapshot;

/// Publisher side, driven by the SDK's `onProgress` callback.
///
/// `token` identifies the sync, `(chainId, address)` at the call sites. A
/// `scanning` call claims the counter; `finished` releases it only if it still
/// holds it.
export const syncProgress = {
  scanning(token: string, scanned: number, hits: number): void {
    owner = token;
    emit({ active: true, scanned, hits });
  },
  finished(token: string): void {
    if (owner !== undefined && owner !== token) return;
    owner = undefined;
    emit(IDLE);
  },
  /// Release the counter regardless of owner. For teardown paths — chain switch,
  /// disconnect — where there is no in-flight sync to name.
  reset(): void {
    owner = undefined;
    emit(IDLE);
  },
};

/// Live note-scan progress.
///
/// Surfaces the SDK's per-page progress. A cold sync pages the whole feed and is
/// the longest wait in the app, so a moving count is what distinguishes it from
/// a hang.
export function useSyncProgress(): SyncProgress {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
