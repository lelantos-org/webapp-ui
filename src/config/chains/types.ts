// The shape of one chain and of the assets registered on it, plus the two
// lookups every caller needs. No parsing and no I/O — those are `schema.ts` /
// `parse.ts` and `registry.ts` — so anything wanting only the types can import
// this without pulling zod or `env` in behind it.

import type { EvmAddress } from "@lelantos-org/sdk";

/// Display-friendly view of one asset registered on the MASP.
///
/// Served whole by the relayer's `/chains`, so no client needs per-token
/// `symbol()` and `decimals()` RPC reads. Their silent failure would leave the
/// asset labelled `#<id>` with `isWeth` false, hiding the native-ETH option.
export interface RegisteredAsset {
  id: bigint;
  token: EvmAddress;
  /// True iff this is the chain's wrapped native token, matched on symbol.
  /// Selects the auto-wrap path over the ERC-20 permit flow.
  isWeth: boolean;
  /// Falls back to `#<id>` when the indexer has not resolved a symbol.
  symbol: string;
  decimals: number;
  /// Circuit-units → base-units multiplier.
  scale: bigint;
  /// Pool-managed yield index, RAY-scaled; `RAY` when the pool reports none.
  ///
  /// `baseUnits = circuitUnits * scale * index / RAY`. A note's unit count never
  /// moves but its worth does, which is why a yield balance grows on its own and
  /// why every display conversion carries this.
  ///
  /// Display-grade only. The pool floors this where it reports it, so it must
  /// never size what a user pays; the SDK does that from the exact
  /// `gross / supply`.
  index: bigint;
  /// Whether the pool routes this asset's balance to a yield venue.
  ///
  /// Not derivable from `index`: an asset bound to a venue moments ago sits at
  /// exactly `RAY`.
  yieldEnabled: boolean;
  /// The venue is no longer being supplied. The balance is still fully backed —
  /// the asset has degraded to plain custody — but it has stopped earning.
  yieldHalted: boolean;
}

/// Everything that varies per chain.
///
/// Service URLs are excluded: one relayer, fmd-webserver and metaquoter serve
/// every chain, selecting by chainId in the path or query, so those stay global
/// on `env`. Only chain identity and the contracts deployed on it belong here.
export interface ChainEntry {
  chainId: bigint;
  /// Human label; also what `wallet_addEthereumChain` registers the chain as.
  chainName: string;
  rpcUrl: string;
  maspAddress: EvmAddress;
  /// SNARK-bound: must equal the relayer pipeline signer or the pool reverts.
  relayerAddress: EvmAddress;
  permit2Address?: EvmAddress;
  /// Absent means native-ETH deposit and `withdrawEth` have no entry point on
  /// this chain; the "ETH (native)" option is then withheld rather than offered
  /// and rejected at submit.
  nativeAdapterAddress?: EvmAddress;
  swapWrapperAddress?: EvmAddress;
  treeDepth: number;
  /// Block-explorer base, for tx links.
  explorerUrl?: string;
  /// Assets registered on this chain. Empty while the indexer catches up, which
  /// means "not known yet" rather than "none supported".
  tokens: RegisteredAsset[];
}

/// Canonical spelling of a chainId for storage keys and cache namespaces.
///
/// Hex. Use this everywhere a chainId is embedded in a key, so one chain cannot
/// address itself two different ways across caches.
export function chainKey(chainId: bigint): string {
  return chainId.toString(16);
}

export function findChain(registry: ChainEntry[], chainId: bigint): ChainEntry | undefined {
  return registry.find((c) => c.chainId === chainId);
}
