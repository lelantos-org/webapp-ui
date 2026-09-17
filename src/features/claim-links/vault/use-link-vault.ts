import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ChainEntry, RegisteredAsset } from "@/config/chains";
import { findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain";
import { type ClaimLinkPressure, claimLinkPressureOf } from "./policy";
import type { StoredClaimLink } from "./record";
import {
  claimLinksMemoryOnly,
  claimLinksSnapshot,
  pruneExpiredClaimLinks,
  subscribeClaimLinks,
} from "./store";

export interface LinkVaultView {
  /// See `claimLinksSnapshot`.
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

/// The registry entry a stored link belongs to, or `undefined` if the registry no longer serves it.
export function useLinkChainFor(): (link: StoredClaimLink) => ChainEntry | undefined {
  const registry = useChainRegistry();
  return useCallback(
    (link: StoredClaimLink) => findChain(registry, BigInt(link.chainId)),
    [registry],
  );
}

/// The tokens a stored link is labelled from: its own chain's, as asset ids are per chain.
export function useLinkAssetsFor(): (link: StoredClaimLink) => readonly RegisteredAsset[] {
  const chainFor = useLinkChainFor();
  return useCallback((link: StoredClaimLink) => chainFor(link)?.tokens ?? [], [chainFor]);
}

/// Sweep expired records off disk on mount, or an idle sender's spending keys stay stored forever.
function usePruneOnMount(): void {
  useEffect(() => {
    pruneExpiredClaimLinks();
  }, []);
}
