// The set of chains the app can operate on, and the shape of one of them.
//
// Sourced entirely from the relayer's `/chains`, the only service that
// enumerates every chain a deployment serves. A chain can therefore be added,
// or its addresses redeployed, without rebuilding this bundle, and no per-chain
// `VITE_*` var is needed.

import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import { z } from "zod";
import { env } from "@/config/env";
import { createLogger } from "@/shared/lib/logger";
import { localStore, writeJson } from "@/shared/lib/storage";

const log = createLogger("chains");

/// Display-friendly view of one asset registered on the MASP.
///
/// Served whole by the relayer's `/chains`, so no client needs per-token
/// `symbol()` and `decimals()` RPC reads, whose silent failure would leave the
/// asset labelled `#<id>` and `isWeth` false, hiding the native-ETH option.
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
/// Everything past `chainId` is optional: a deployment fills the wallet-facing
/// block in progressively, and an older relayer serves none of it.
/// `toChainEntry` decides which omissions are survivable.
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

/// A row the relayer could not fully describe is still usable: the id, address
/// and scale suffice to transact, and only the label degrades.
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

/// A row that could not be turned into a usable chain, and why.
///
/// Returned rather than logged in place, keeping the mapping pure: the caller
/// reports every skipped chain once, and tests can assert on the reason without
/// reading log output.
export interface UnusableChain {
  chainId: bigint;
  missing: string[];
}

export type ChainEntryResult =
  | { ok: true; entry: ChainEntry }
  | { ok: false; reason: UnusableChain };

/// Fold one row into a usable `ChainEntry`, or report what it lacks.
///
/// The row is the only source; no build-time value stands in for a missing
/// field, so a deployment can never run against stale baked-in addresses.
export function toChainEntry(row: ChainRow): ChainEntryResult {
  try {
    return parseChainRow(row);
  } catch (e) {
    // `evmAddress` and `BigInt` both throw on malformed input and zod catches
    // neither: `z.string()` does not check that `scale` is numeric, and
    // `z.number()` does not reject a float, where `BigInt(1.5)` raises
    // `RangeError`. Catching here keeps one bad row from rejecting the whole
    // registry, which is what the per-row result type is for.
    log.warn("unparseable chain row", { chainId: row.chainId, error: e });
    return { ok: false, reason: { chainId: safeChainId(row.chainId), missing: ["unparseable"] } };
  }
}

/// Best-effort id for reporting a row that could not be parsed at all.
///
/// `chainId` is `z.number()` and so already numeric, but a non-integer would
/// still make `BigInt` throw. `Number.isInteger` keeps that from throwing inside
/// the error handler.
function safeChainId(raw: number): bigint {
  return Number.isInteger(raw) ? BigInt(raw) : 0n;
}

function parseChainRow(row: ChainRow): ChainEntryResult {
  const chainId = BigInt(row.chainId);
  const { rpcUrl, maspAddress, relayerAddress, treeDepth } = row;

  // A wallet cannot be built without these four, and a guessed value would sign
  // against the wrong deployment. Checked in one condition so the narrowing
  // below follows from it, with the labels derived from the same checks.
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

  const optional = (v: string | undefined) => (v ? evmAddress(v) : undefined);

  return {
    ok: true,
    entry: {
      chainId,
      chainName: row.chainName ?? `chain ${chainId}`,
      rpcUrl,
      maspAddress: evmAddress(maspAddress),
      relayerAddress: evmAddress(relayerAddress),
      permit2Address: optional(row.permit2Address),
      nativeAdapterAddress: optional(row.nativeAdapterAddress),
      swapWrapperAddress: optional(row.swapWrapperAddress),
      treeDepth,
      explorerUrl: row.explorerUrl,
      tokens: (row.tokens ?? []).map(toRegisteredAsset),
    },
  };
}

/// How long to wait on the relayer before giving up on the registry.
///
/// Without a bound, a relayer that accepts the connection and then stalls leaves
/// the query pending indefinitely while `ChainProvider` renders "loading
/// chains…" in place of the entire app.
const REGISTRY_TIMEOUT_MS = 10_000;

/// Where the last successful `/chains` body is kept.
///
/// Namespaced by relayer URL and carrying a schema version. `env.relayerUrl` is
/// absolute (`serviceUrl` in config/env.ts applies `toAbsoluteUrl`), so the
/// namespace is per-origin as well as per-path and a build pointed at one
/// relayer cannot read a body written by a build pointed at another. Bump `v1`
/// when the expected shape changes.
const REGISTRY_CACHE_KEY = `lelantos.chain-registry.v1.${env.relayerUrl}`;

/// Fold a `/chains` body into the chains this app can use.
///
/// Shared by the network read and the cache read, so a cached body passes the
/// same zod schema and row mapping as a fresh one. An entry truncated mid-write,
/// left by an older build, or hand-edited is rejected here rather than reaching
/// the app as a half-built `ChainEntry`.
function entriesFromResponse(body: unknown, source: "relayer" | "cache"): ChainEntry[] {
  const rows: ChainRow[] = chainsResponse.parse(body).chains;

  const results = rows.map(toChainEntry);
  const skipped = results.filter((r) => !r.ok).map((r) => r.reason);
  if (skipped.length > 0) {
    log.warn("skipping chains the deployment does not fully describe", {
      source,
      chains: skipped.map((s) => ({ chainId: s.chainId.toString(), missing: s.missing })),
    });
  }

  return results
    .filter((r) => r.ok)
    .map((r) => r.entry)
    .sort((a, b) => (a.chainId < b.chainId ? -1 : a.chainId > b.chainId ? 1 : 0));
}

/// The last registry this browser saw, if any.
///
/// `ChainProvider` renders this immediately and revalidates behind it. The
/// registry gates every wallet-facing read, so this keeps a cold or slow relayer
/// from holding the whole app on a spinner for a full round-trip.
///
/// Returns `undefined` rather than `[]` for an unusable entry, so the caller
/// cannot mistake "nothing cached" for "the relayer serves nothing" — the same
/// distinction `loadChainRegistry` draws between throwing and resolving empty.
export function readCachedChainRegistry(): ChainEntry[] | undefined {
  const raw = localStore.get(REGISTRY_CACHE_KEY);
  if (raw === undefined) return undefined;
  try {
    const entries = entriesFromResponse(JSON.parse(raw), "cache");
    return entries.length > 0 ? entries : undefined;
  } catch (e) {
    // Unusable rather than absent: drop it, so a body that will never parse is
    // not re-read and re-rejected on every boot.
    log.warn("discarding unusable cached chain registry", e);
    localStore.remove(REGISTRY_CACHE_KEY);
    return undefined;
  }
}

/// The chains this deployment can talk to.
///
/// Throws when the registry cannot be read, keeping an unreachable relayer
/// distinguishable from one serving an empty list. Resolving `[]` in both cases
/// would report a 502 as an empty registry and leave nothing to retry from.
export async function loadChainRegistry(): Promise<ChainEntry[]> {
  const r = await fetch(`${env.relayerUrl}/chains`, {
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`relayer /chains responded ${r.status}`);
  const body: unknown = await r.json();
  const entries = entriesFromResponse(body, "relayer");

  // Cache the raw body rather than the mapped entries: `ChainEntry` holds
  // bigints, which `JSON.stringify` rejects, and storing the relayer's own
  // response makes the cache read run the same validation as this path.
  //
  // Only a non-empty result is kept. An empty one is a valid answer, but seeding
  // a future boot with it would render the "no usable network" screen from cache
  // before the relayer had been asked again.
  if (entries.length > 0) writeJson(localStore, REGISTRY_CACHE_KEY, body);

  // An empty result is a valid answer: the relayer replied and nothing it serves
  // is usable here. Distinct from the throw above, which means no answer was
  // received; the provider words the two cases differently.
  return entries;
}
