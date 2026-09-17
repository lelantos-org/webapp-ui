import { createStore, useStore } from "@/shared/lib/external-store";

export interface SyncProgress {
  active: boolean;
  /// Notes trial-decrypted so far this sync.
  scanned: number;
  /// Of those, the ones belonging to this wallet.
  hits: number;
}

const IDLE: SyncProgress = { active: false, scanned: 0, hits: 0 };

const store = createStore<SyncProgress>(IDLE);

// Syncs overlap, so only the owning sync may reset the counter.
let owner: string | undefined;

/// Publisher side for the SDK's `onProgress`; `token` names the sync that owns the counter.
export const syncProgress = {
  scanning(token: string, scanned: number, hits: number): void {
    owner = token;
    store.setState({ active: true, scanned, hits });
  },
  finished(token: string): void {
    if (owner !== undefined && owner !== token) return;
    owner = undefined;
    store.setState(IDLE);
  },
  /// Release the counter regardless of owner, for teardown.
  reset(): void {
    owner = undefined;
    store.setState(IDLE);
  },
};

/// Live note-scan progress.
export function useSyncProgress(): SyncProgress {
  return useStore(store);
}
