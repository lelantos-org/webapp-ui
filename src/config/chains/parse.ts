// Turning a `/chains` row into a `ChainEntry`, and reporting the ones that
// cannot be.
//
// Nothing here does I/O or reads a cache — `registry.ts` owns both — so every
// decision about what a partially-described deployment may still be used for is
// testable against a literal row.

import { evmAddress, RAY } from "@lelantos-org/sdk";
import { createLogger } from "@/shared/lib/logger";
import { type ChainRow, chainsResponse, type TokenRow, yieldStateRow } from "./schema";
import type { ChainEntry, RegisteredAsset } from "./types";

const log = createLogger("chains");

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
function toRegisteredAsset(t: TokenRow): RegisteredAsset {
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
    ...toYieldFields(t.yieldState),
  };
}

/// Plain custody. `RAY` is the identity for every conversion, so an asset with
/// no usable yield block reduces to plain `scale` arithmetic.
const PLAIN_CUSTODY = { index: RAY, yieldEnabled: false, yieldHalted: false } as const;

/// The yield half of a registered asset, degrading to plain custody.
///
/// Re-validated here rather than trusted from the caller, since `toChainEntry`
/// is reachable with a row that has not been through the schema. A bad `scale`
/// rightly rejects the asset, which cannot transact without it; a lost index
/// only flattens the balance, so it degrades rather than dropping a spendable
/// asset.
function toYieldFields(
  raw: unknown,
): Pick<RegisteredAsset, "index" | "yieldEnabled" | "yieldHalted"> {
  const parsed = yieldStateRow.safeParse(raw);
  if (!parsed.success) return PLAIN_CUSTODY;
  try {
    return {
      index: BigInt(parsed.data.index),
      yieldEnabled: true,
      yieldHalted: parsed.data.halted,
    };
  } catch {
    // `z.string()` does not check that `index` is numeric, the same gap the
    // row-level catch exists for.
    return PLAIN_CUSTODY;
  }
}

/// A row that could not be turned into a usable chain, and why.
///
/// Returned rather than logged in place, which keeps the mapping pure: the
/// caller reports every skipped chain once, and tests assert on the reason
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
/// Fold a `/chains` body into the chains this app can use.
///
/// Shared by the network read and the cache read, so a cached body passes the
/// same zod schema and row mapping as a fresh one. An entry truncated mid-write
/// or hand-edited is rejected here rather than reaching the app as a half-built
/// `ChainEntry`.
export function entriesFromResponse(body: unknown, source: "relayer" | "cache"): ChainEntry[] {
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
