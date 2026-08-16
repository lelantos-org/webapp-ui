// The set of chains the app can operate on, and the shape of one of them.
//
// Sourced from the relayer's `/chains`, which is the only service that already
// enumerates every chain a deployment serves. That is what lets a chain be
// added without rebuilding this bundle: the wallet-facing half of the
// relayer's config is published there, and everything below reads a
// `ChainEntry` rather than reaching for `env`.

import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import { z } from "zod";
import { env } from "@/config/env";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("chains");

/// Everything that varies per chain.
///
/// Service URLs are deliberately absent. One relayer, fmd-webserver, explorer
/// and metaquoter serve every chain — they select by chainId in the path or
/// query — so those stay global on `env`. Only chain identity and the
/// contracts deployed on it belong here.
/// Display-friendly view of one asset registered on the MASP.
///
/// Served whole by the relayer's `/chains`: before, only `(id, token, scale)`
/// was known and every client read `symbol()` and `decimals()` per token over
/// RPC on each load — reads whose silent failure left the asset labelled
/// `#<id>` and, worse, left `isWeth` false, hiding the native-ETH option.
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
}

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
  /// this chain, and the "ETH (native)" option is withheld rather than
  /// offered and then failed at submit.
  nativeAdapterAddress?: EvmAddress;
  swapWrapperAddress?: EvmAddress;
  treeDepth: number;
  /// Block-explorer base, for tx links.
  explorerUrl?: string;
  /// Assets registered on this chain. Empty while the indexer catches up,
  /// which reads as "not known yet", not "this chain supports nothing".
  tokens: RegisteredAsset[];
}

/// Canonical spelling of a chainId for storage keys and cache namespaces.
///
/// Hex, matching the majority of the keys that already existed. The point is
/// less which radix wins than that there is exactly one: before this, the
/// persisted-store keys and the ephemeral claim-link key used decimal while
/// the nsk cache, the FMD subscription cache and the in-flight build map used
/// hex, so the same chain wrote itself two different ways.
export function chainKey(chainId: bigint): string {
  return chainId.toString(16);
}

export function findChain(registry: ChainEntry[], chainId: bigint): ChainEntry | undefined {
  return registry.find((c) => c.chainId === chainId);
}

const tokenRow = z.object({
  assetId: z.number(),
  token: z.string(),
  /// Decimal string: `scale` exceeds what a JSON number holds safely.
  scale: z.string(),
  decimals: z.number().optional(),
  symbol: z.string().optional(),
});

/// One row of the relayer's `/chains`.
///
/// Everything past `chainId` is optional because a deployment fills the
/// wallet-facing block in progressively, and an older relayer serves none of
/// it. `toChainEntry` decides what is recoverable from `env` and what makes
/// the row unusable.
const chainRow = z.object({
  chainId: z.number(),
  maspAddress: z.string().optional(),
  relayerAddress: z.string().optional(),
  chainName: z.string().optional(),
  rpcUrl: z.string().optional(),
  treeDepth: z.number().optional(),
  permit2Address: z.string().optional(),
  nativeAdapterAddress: z.string().optional(),
  swapWrapperAddress: z.string().optional(),
  explorerUrl: z.string().optional(),
  tokens: z.array(tokenRow).optional(),
});

const chainsResponse = z.object({ chains: z.array(chainRow) });

/// Decimals implied by `scale` when the indexer has not read the token's own.
///
/// A last resort, not a default: `scale` is a circuit capacity parameter, so
/// this is right only for the common `scale = 10^d` shape.
function scaleToDecimals(scale: bigint): number {
  let d = 0;
  for (let s = scale; s > 1n; s /= 10n) d++;
  return d;
}

/// A row the relayer could not describe is still usable — the id, address and
/// scale are enough to transact; only the label degrades.
function toRegisteredAsset(t: z.infer<typeof tokenRow>): RegisteredAsset {
  const id = BigInt(t.assetId);
  const scale = BigInt(t.scale);
  const symbol = t.symbol ?? `#${id}`;
  return {
    id,
    token: evmAddress(t.token),
    isWeth: symbol.toUpperCase() === "WETH",
    symbol,
    decimals: t.decimals ?? scaleToDecimals(scale),
    scale,
  };
}

export type ChainRow = z.infer<typeof chainRow>;

/// The build-time settings, usable only for the one chain they describe.
function envFallback(chainId: bigint): Partial<ChainEntry> | undefined {
  if (chainId !== env.chainId) return undefined;
  return {
    chainName: env.chainName,
    rpcUrl: env.rpcUrl,
    maspAddress: env.maspAddress,
    relayerAddress: env.relayerAddress,
    permit2Address: env.permit2Address,
    nativeAdapterAddress: env.nativeAdapterAddress,
    swapWrapperAddress: env.swapWrapperAddress,
    treeDepth: env.treeDepth,
    explorerUrl: env.explorerUrl,
  };
}

/// A row that could not be turned into a usable chain, and why.
///
/// Returned rather than logged in place so the mapping stays pure: the caller
/// reports every skipped chain once, and tests can assert on the reason
/// without reading log output.
export interface UnusableChain {
  chainId: bigint;
  missing: string[];
}

export type ChainEntryResult =
  | { ok: true; entry: ChainEntry }
  | { ok: false; reason: UnusableChain };

/// Fold one row into a usable `ChainEntry`, or report what it lacks.
///
/// A row wins over `env` field by field, and `env` only stands in for the
/// single chain it was built for — which is what keeps a second chain from
/// silently inheriting the first one's RPC or contract addresses.
export function toChainEntry(row: ChainRow): ChainEntryResult {
  const chainId = BigInt(row.chainId);
  const fb = envFallback(chainId);

  const rpcUrl = row.rpcUrl ?? fb?.rpcUrl;
  const maspAddress = row.maspAddress ?? fb?.maspAddress;
  const relayerAddress = row.relayerAddress ?? fb?.relayerAddress;
  const treeDepth = row.treeDepth ?? fb?.treeDepth;

  // A wallet cannot be built without these four, and guessing any of them
  // would produce one that signs against the wrong deployment. One condition
  // so the narrowing below is free; the labels come from the same checks.
  if (
    rpcUrl === undefined ||
    maspAddress === undefined ||
    relayerAddress === undefined ||
    treeDepth === undefined
  ) {
    const missing = [
      rpcUrl === undefined && "rpcUrl",
      maspAddress === undefined && "maspAddress",
      relayerAddress === undefined && "relayerAddress",
      treeDepth === undefined && "treeDepth",
    ].filter((m): m is string => typeof m === "string");
    return { ok: false, reason: { chainId, missing } };
  }

  const optional = (v: string | undefined, f: EvmAddress | undefined) => (v ? evmAddress(v) : f);

  return {
    ok: true,
    entry: {
      chainId,
      chainName: row.chainName ?? fb?.chainName ?? `chain ${chainId}`,
      rpcUrl,
      maspAddress: evmAddress(maspAddress),
      relayerAddress: evmAddress(relayerAddress),
      permit2Address: optional(row.permit2Address, fb?.permit2Address),
      nativeAdapterAddress: optional(row.nativeAdapterAddress, fb?.nativeAdapterAddress),
      swapWrapperAddress: optional(row.swapWrapperAddress, fb?.swapWrapperAddress),
      treeDepth,
      explorerUrl: row.explorerUrl ?? fb?.explorerUrl,
      tokens: (row.tokens ?? []).map(toRegisteredAsset),
    },
  };
}

/// The chains this deployment can talk to.
///
/// A relayer that is unreachable or serves nothing usable falls back to the
/// single chain this bundle was built for, so a registry outage degrades to
/// the previous single-chain behaviour instead of an app that cannot render.
export async function loadChainRegistry(): Promise<ChainEntry[]> {
  let rows: ChainRow[] = [];
  try {
    const r = await fetch(`${env.relayerUrl}/chains`);
    if (!r.ok) throw new Error(`relayer /chains ${r.status}`);
    rows = chainsResponse.parse(await r.json()).chains;
  } catch (e) {
    log.warn("chain registry unavailable; falling back to build-time config", e);
  }

  const results = rows.map(toChainEntry);
  const skipped = results.filter((r) => !r.ok).map((r) => r.reason);
  if (skipped.length > 0) {
    log.warn("skipping chains the deployment does not fully describe", {
      chains: skipped.map((s) => ({ chainId: s.chainId.toString(), missing: s.missing })),
    });
  }

  const entries = results
    .filter((r) => r.ok)
    .map((r) => r.entry)
    .sort((a, b) => (a.chainId < b.chainId ? -1 : a.chainId > b.chainId ? 1 : 0));
  if (entries.length > 0) return entries;

  // Nothing usable from the registry: fall back to the one chain this bundle
  // was built for, so an outage degrades to the previous single-chain
  // behaviour rather than an app that cannot render.
  const fallback = toChainEntry({ chainId: Number(env.chainId) });
  return fallback.ok ? [fallback.entry] : [];
}
