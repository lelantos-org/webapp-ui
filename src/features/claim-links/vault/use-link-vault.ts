import { useEffect, useSyncExternalStore } from "react";
import { type ClaimLinkPressure, claimLinkPressureOf } from "./policy";
import type { StoredClaimLink } from "./record";
import {
  claimLinksMemoryOnly,
  claimLinksSnapshot,
  pruneExpiredClaimLinks,
  subscribeClaimLinks,
} from "./store";

export interface LinkVaultView {
  stored: StoredClaimLink[];
  pressure: ClaimLinkPressure;
  /// Storage refused the last write; see `claimLinksMemoryOnly`.
  memoryOnly: boolean;
  /// The clock the view was computed at, shared by the rows and the pressure.
  now: number;
}

export function useLinkVault(): LinkVaultView {
  const stored = useSyncExternalStore(subscribeClaimLinks, claimLinksSnapshot, claimLinksSnapshot);
  usePruneOnMount();
  const now = Date.now();
  return {
    stored,
    pressure: claimLinkPressureOf(stored, now),
    memoryOnly: claimLinksMemoryOnly(),
    now,
  };
}

/// Sweep expired records off disk on mount, or an idle sender's spending keys stay stored forever.
function usePruneOnMount(): void {
  useEffect(() => {
    pruneExpiredClaimLinks();
  }, []);
}
