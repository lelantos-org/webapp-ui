// The vault as React state: the stored records, the pressure on them, and the
// once-per-mount sweep of expired keys off disk.

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
  /// The clock the view was computed against, so rows age against the same
  /// instant as the pressure above them.
  now: number;
}

export function useLinkVault(): LinkVaultView {
  const stored = useSyncExternalStore(subscribeClaimLinks, claimLinksSnapshot, claimLinksSnapshot);
  usePruneOnMount();
  // Read per render rather than memoised on `stored`: a record ages toward its
  // drop whether or not the store changes, and every render of the vault is
  // cheap next to the cost of a stale "drops in 2 days".
  const now = Date.now();
  return {
    stored,
    pressure: claimLinkPressureOf(stored, now),
    memoryOnly: claimLinksMemoryOnly(),
    now,
  };
}

/// The registry entry a stored link belongs to, or `undefined` for a network
/// the registry no longer serves.
export function useLinkChainFor(): (link: StoredClaimLink) => ChainEntry | undefined {
  const registry = useChainRegistry();
  return useCallback(
    (link: StoredClaimLink) => findChain(registry, BigInt(link.chainId)),
    [registry],
  );
}

/// The tokens a stored link's amount is labelled from: its own network's, not
/// the active one's, since a record may belong to any chain the registry serves
/// and asset ids are unique only within one.
export function useLinkAssetsFor(): (link: StoredClaimLink) => readonly RegisteredAsset[] {
  const chainFor = useLinkChainFor();
  return useCallback((link: StoredClaimLink) => chainFor(link)?.tokens ?? [], [chainFor]);
}

/// Sweep records past the TTL out of storage, once per mount.
///
/// Expiry is otherwise enforced only on write, so a wallet that sent one link and
/// stopped would keep that record — and its spending key — on disk indefinitely,
/// hidden behind the views' liveness filter. Running it from an effect keeps the
/// write out of the render pass.
///
/// Mount-only suffices: every later change to the store goes through the vault's
/// write path, which prunes as it goes.
function usePruneOnMount(): void {
  useEffect(() => {
    pruneExpiredClaimLinks();
  }, []);
}
