// The set of chains the app can operate on, and the shape of one of them.
//
// Sourced entirely from the relayer's `/chains`, the only service that already
// enumerates every chain a deployment serves. That is what lets a chain be
// added, or its addresses redeployed, without rebuilding this bundle — and why
// no per-chain `VITE_*` var remains.

import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import { z } from "zod";
import { env } from "@/config/env";
import { createLogger } from "@/shared/lib/logger";
import { localStore, writeJson } from "@/shared/lib/storage";

const log = createLogger("chains");

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

/// Everything that varies per chain.
///
/// Service URLs are deliberately absent. One relayer, fmd-webserver and
/// metaquoter serve every chain — they select by chainId in the path or query
/// — so those stay global on `env`. Only chain identity and the contracts
/// deployed on it belong here.
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
/// it. `toChainEntry` decides which omissions are survivable and which make
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
/// The row is the only source. Build-time values used to stand in for the one
/// chain a bundle was configured for, which meant a deployment could look
/// fine while actually running on stale baked-in addresses — and it kept ten
/// `VITE_*` vars alive to describe something the relayer already publishes.
export function toChainEntry(row: ChainRow): ChainEntryResult {
  try {
    return parseChainRow(row);
  } catch (e) {
    // `evmAddress` and `BigInt` both throw on malformed input, and zod does not
    // catch either: `z.string()` does not check that `scale` is numeric, and
    // `z.number()` does not reject a float — `BigInt(1.5)` is a `RangeError`.
    // This mapping used to run outside the caller's try, so one chain
    // publishing a bad token address rejected `loadChainRegistry` outright and
    // showed "no chains available" for *every* chain. The per-row result type
    // exists precisely so one bad row is skipped; a throw bypassed it.
    log.warn("unparseable chain row", { chainId: row.chainId, error: e });
    return { ok: false, reason: { chainId: safeChainId(row.chainId), missing: ["unparseable"] } };
  }
}

/// Best-effort id for reporting a row that could not be parsed at all.
///
/// `chainId` is `z.number()`, so it is already numeric by the time a row gets
/// here — but a non-integer would still make `BigInt` throw, and this runs on
/// the path that exists to stop one bad row taking down the registry.
/// `Number.isInteger` keeps that from becoming a throw inside the error handler.
function safeChainId(raw: number): bigint {
  return Number.isInteger(raw) ? BigInt(raw) : 0n;
}

function parseChainRow(row: ChainRow): ChainEntryResult {
  const chainId = BigInt(row.chainId);
  const { rpcUrl, maspAddress, relayerAddress, treeDepth } = row;

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
/// Without a bound, a relayer that accepts the connection and then stalls
/// leaves the query pending forever — and `ChainProvider` renders "loading
/// chains…" in place of the entire app while it does.
const REGISTRY_TIMEOUT_MS = 10_000;

/// Where the last successful `/chains` body is kept.
///
/// Namespaced by relayer URL and carrying a schema version. `env.relayerUrl` is
/// already absolute — `serviceUrl` in config/env.ts runs it through
/// `toAbsoluteUrl`, so the configured `/relayer` arrives here as
/// `https://app.<domain>/relayer` — which makes the namespace per-origin as
/// well as per-path, and keeps a dev build pointed at one relayer from reading
/// a body written by a build pointed at another. Bump `v1` if the shape this
/// module expects ever changes.
const REGISTRY_CACHE_KEY = `lelantos.chain-registry.v1.${env.relayerUrl}`;

/// Fold a `/chains` body into the chains this app can use.
///
/// Shared by the network read and the cache read on purpose: a cached body is
/// validated by exactly the same zod schema and row mapping as a fresh one, so
/// an entry truncated by a crash mid-write, left behind by an older build or
/// edited by hand is rejected here rather than reaching the app as a
/// half-built `ChainEntry`.
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
/// `ChainProvider` renders this immediately and revalidates behind it, which is
/// what keeps a cold or slow relayer from holding the entire app on a spinner:
/// the registry gates every wallet-facing read, so waiting for it used to mean
/// waiting for a full round-trip to the relayer before anything at all
/// appeared.
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
/// Throws when the registry cannot be read. That is the point: swallowing the
/// error and resolving `[]` made an unreachable relayer indistinguishable from
/// one serving an empty list, so a 502 was reported to the user as "the
/// registry is empty" — with no retry, since there was no error to retry from.
export async function loadChainRegistry(): Promise<ChainEntry[]> {
  const r = await fetch(`${env.relayerUrl}/chains`, {
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`relayer /chains responded ${r.status}`);
  const body: unknown = await r.json();
  const entries = entriesFromResponse(body, "relayer");

  // Cache the raw body, not the mapped entries: `ChainEntry` holds bigints,
  // which `JSON.stringify` refuses outright. Storing what the relayer said also
  // means the cache read runs the same validation as this one.
  //
  // Only a non-empty result is worth keeping. An empty one is a real answer,
  // but seeding a future boot with it would render the "no usable network"
  // screen from cache before the relayer had been asked again.
  if (entries.length > 0) writeJson(localStore, REGISTRY_CACHE_KEY, body);

  // An empty result is a real answer — the relayer replied, and nothing it
  // serves is usable here. Distinct from the throw above, which means we never
  // got an answer at all; the provider words the two differently.
  return entries;
}
