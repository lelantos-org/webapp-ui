// The vault as React state: the stored records, the pressure on them, and the
// once-per-mount sweep of expired keys off disk.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { findChain } from "@/config/chains";
import { useChainRegistry } from "@/features/chain";
import { type ClaimLinkPressure, claimLinkPressureOf } from "./link-vault/policy";
import type { StoredClaimLink } from "./link-vault/record";
import {
  claimLinksMemoryOnly,
  claimLinksSnapshot,
  pruneExpiredClaimLinks,
  subscribeClaimLinks,
} from "./link-vault/store";

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

/// The tokens a stored link's amount is labelled from: its own network's, not
/// the active one's, since a record may belong to any chain the registry serves
/// and asset ids are unique only within one.
export function useLinkAssetsFor(): (link: StoredClaimLink) => readonly RegisteredAsset[] {
  const registry = useChainRegistry();
  return useCallback(
    (link: StoredClaimLink) => findChain(registry, BigInt(link.chainId))?.tokens ?? [],
    [registry],
  );
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
