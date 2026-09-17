import type { EvmAddress } from "@lelantos-org/sdk";

/// Display-friendly view of one asset registered on the MASP.
export interface RegisteredAsset {
  id: bigint;
  token: EvmAddress;
  /// The chain's wrapped native token; selects auto-wrap over the permit flow.
  isWeth: boolean;
  /// Falls back to `#<id>` when the indexer has not resolved a symbol.
  symbol: string;
  decimals: number;
  /// Circuit-units → base-units multiplier.
  scale: bigint;
  /// Yield index, RAY-scaled. Display-only: floored, so never use it to size a payment.
  index: bigint;
  /// Whether the pool routes this asset to a yield venue (not derivable from `index`).
  yieldEnabled: boolean;
  /// Venue no longer supplied: still fully backed, but not earning.
  yieldHalted: boolean;
  /// Estimated net annual rate with its window; `undefined` is unmeasured, not zero.
  apy?: VenueRate;
  /// ERC-4626 vault `name()`, when known.
  vaultName?: string;
}

/// A measured annual rate and the span behind it.
export interface VenueRate {
  /// A fraction — `0.0418` for 4.18%.
  rate: number;
  /// Days the readings actually spanned.
  windowDays: number;
}

/// Everything that varies per chain; service URLs stay global on `env`.
export interface ChainEntry {
  chainId: bigint;
  /// Human label; also what `wallet_addEthereumChain` registers the chain as.
  chainName: string;
  /// Installed permanently in the user's wallet: keep general-purpose, never the read proxy.
  rpcUrl: string;
  /// The SDK's read endpoint; falls back to `rpcUrl`.
  readRpcUrl: string;
  maspAddress: EvmAddress;
  /// SNARK-bound: must equal the relayer pipeline signer or the pool reverts.
  relayerAddress: EvmAddress;
  permit2Address?: EvmAddress | undefined;
  /// Absent means no native-ETH deposit or withdrawal on this chain.
  nativeAdapterAddress?: EvmAddress | undefined;
  swapWrapperAddress?: EvmAddress | undefined;
  /// Governance contracts, absent where the deployment runs none.
  governorAddress?: EvmAddress | undefined;
  govTokenAddress?: EvmAddress | undefined;
  timelockAddress?: EvmAddress | undefined;
  treeDepth: number;
  /// Block-explorer base, for tx links.
  explorerUrl?: string | undefined;
  /// Registered assets; empty means not indexed yet. Shared, so never mutate.
  readonly tokens: readonly RegisteredAsset[];
}

/// Canonical (hex) chainId for storage keys and cache namespaces.
export function chainKey(chainId: bigint): string {
  return chainId.toString(16);
}

/// The registry entry for `chainId`, if any.
export function findChain(
  registry: readonly ChainEntry[],
  chainId: bigint,
): ChainEntry | undefined {
  return registry.find((c) => c.chainId === chainId);
}
