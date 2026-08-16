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
export const syncProgress = {
  scanning(scanned: number, hits: number): void {
    emit({ active: true, scanned, hits });
  },
  finished(): void {
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
