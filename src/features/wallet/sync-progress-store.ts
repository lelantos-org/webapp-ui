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
/// The store is a module singleton with one counter, but syncs overlap: a
/// chain switch starts a new one while the old one is still paging, and the
/// old one's `finished()` used to zero the live one's counter mid-flight. The
/// counter exists precisely to distinguish a long sync from a hang, so blanking
/// it is the one failure it must not have. Late emissions from a superseded
/// owner are ignored.
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
/// `token` identifies the sync — `(chainId, address)` at the call sites. A
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
  /// Release the counter whoever holds it. For teardown paths (chain switch,
  /// disconnect) where no sync of our own is in flight to name.
  reset(): void {
    owner = undefined;
    emit(IDLE);
  },
};

/// Live note-scan progress.
///
/// The SDK already emitted per-page progress and nothing consumed it, so the
/// initial sync — the longest wait in the app — was an undifferentiated
/// spinner. A cold sync now pages the whole feed, which makes that worse: a
/// number that moves is the only thing distinguishing it from a hang.
export function useSyncProgress(): SyncProgress {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
