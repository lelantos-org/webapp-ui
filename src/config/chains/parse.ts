// Merging the deployment's account of a chain with one relayer's account of
// itself, and reporting the chains that cannot be used.
//
// Nothing here does I/O or reads a cache — `registry.ts` owns both — so every
// decision about what a partially-described or disagreeing deployment may still
// be used for is testable against literal rows.

import { evmAddress } from "@lelantos-org/sdk";
import { RAY } from "@lelantos-org/sdk/protocol";
import { sameAddress } from "@/shared/lib/address";
import { createLogger } from "@/shared/lib/logger";
import {
  type AssetRow,
  type RegistryBundle,
  type RegistryChainRow,
  type RelayerChainRow,
  registryBundle,
  yieldStateRow,
} from "./schema";
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

/// A row the catalog could not fully describe is still usable: the id, address
/// and scale suffice to transact, and only the label degrades.
function toRegisteredAsset(t: AssetRow): RegisteredAsset {
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
/// Typed to the field it reads rather than `unknown`: the caller holds an
/// `AssetRow`, so widening here bought no safety and cost the reader the one
/// thing the signature could have told them. The `safeParse` stays — a JS caller
/// or a hand-built row can still get past the compiler, and `z.string()` does not
/// check that `index` is numeric — but the type now says what is expected.
///
/// A bad `scale` rightly rejects the asset, which cannot transact without it; a
/// lost index only flattens the balance, so it degrades rather than dropping a
/// spendable asset.
function toYieldFields(
  raw: AssetRow["yieldState"],
): Pick<RegisteredAsset, "index" | "yieldEnabled" | "yieldHalted" | "apy" | "vaultName"> {
  const parsed = yieldStateRow.safeParse(raw);
  if (!parsed.success) return PLAIN_CUSTODY;
  try {
    return {
      index: BigInt(parsed.data.index),
      yieldEnabled: true,
      yieldHalted: parsed.data.halted,
      ...toApyFields(parsed.data.apyBps, parsed.data.apyWindowS),
      ...(parsed.data.vaultName === undefined ? {} : { vaultName: parsed.data.vaultName }),
    };
  } catch {
    // `z.string()` does not check that `index` is numeric, the same gap the
    // row-level catch exists for.
    return PLAIN_CUSTODY;
  }
}

/// Seconds in the shortest window the measurement will annualize over.
///
/// A mirror of protocol-webserver's `MIN_WINDOW_SECONDS`, and only a sanity
/// check: it refuses to annualize anything shorter, so a row carrying one is
/// malformed rather than merely fresh. Kept equal to the number the backend
/// actually uses, since a looser floor here would render a figure the backend
/// claims it never emits.
const MIN_WINDOW_S = 2 * 86_400;

/// The rate half of a yield block.
///
/// Both or neither: a rate with no window cannot be labelled honestly, and a
/// window with no rate says nothing, so a row carrying only one is treated as
/// carrying none.
function toApyFields(
  bps: number | undefined,
  windowS: number | undefined,
): Pick<RegisteredAsset, "apy"> {
  if (bps === undefined || windowS === undefined || windowS < MIN_WINDOW_S) return {};
  return { apy: { rate: bps / 10_000, windowDays: Math.round(windowS / 86_400) } };
}

/// Why a chain cannot be used.
///
/// A union rather than one list of strings, because the cases are not the same
/// kind of problem and an operator acts on them differently. `incomplete` is a
/// deployment that has not finished filling a block in. `disagreement` is the
/// two services describing the same pool or tree differently — the check that
/// makes a third-party relayer safe to boot from, so it is the one case that may
/// mean a relayer is pointed somewhere it should not be. Collapsing them into a
/// single `string[]` left the difference legible only to whoever read the
/// strings.
export type UnusableReason =
  | {
      kind: "incomplete";
      /// Names of the fields neither service supplied.
      fields: string[];
    }
  | {
      kind: "disagreement";
      /// One message per field the two services answered differently, each
      /// naming both answers.
      conflicts: string[];
    }
  /// A row that threw on the way in — a non-numeric `scale`, a malformed
  /// address. Carries no detail: the throw was already logged where it happened,
  /// with the error attached.
  | { kind: "unparseable" }
  /// Described by the deployment, but no relayer serves it, so there is nothing
  /// to submit through.
  | { kind: "no-relayer" }
  /// A relayer serves it, but the deployment does not describe it: no rpcUrl to
  /// reach it with, and nothing to check the relayer against.
  | { kind: "undescribed" };

/// A chain that could not be used, and why.
///
/// Returned rather than logged in place, which keeps the merge pure: the caller
/// reports every skipped chain once, and tests assert on the reason without
/// reading log output.
interface UnusableChain {
  chainId: bigint;
  reason: UnusableReason;
}

/// One reason as a line of log output.
///
/// The only place a `UnusableReason` is flattened to text. Exhaustive over the
/// union, so a case added without a wording here is a compile error rather than
/// a chain skipped for a reason nothing prints.
export function describeUnusable(reason: UnusableReason): string {
  switch (reason.kind) {
    case "incomplete":
      return `nothing describes ${reason.fields.join(", ")}`;
    case "disagreement":
      return `the two services disagree: ${reason.conflicts.join("; ")}`;
    case "unparseable":
      return "the rows could not be parsed";
    case "no-relayer":
      return "no relayer serves this chain";
    case "undescribed":
      return "the deployment registry does not describe this chain";
  }
}

export type ChainEntryResult =
  | { ok: true; entry: ChainEntry }
  | { ok: false; reason: UnusableChain };

/// Address equality, on identity rather than spelling.
///
/// Both services publish EIP-55 checksummed, so a plain `===` would usually do.
/// Comparing the parsed value instead means a hand-edited config in either
/// service is judged on the address it names — the thing that actually decides
/// whether a proof lands — rather than on its capitalisation, which is exactly
/// the difference between rejecting a misconfigured relayer and rejecting a
/// correct one.
function sameContract(a: string, b: string): boolean {
  return sameAddress(evmAddress(a), evmAddress(b));
}

/// What the deployment and the relayer must agree on before a wallet uses them
/// together.
///
/// The reason both publish these two. The deployment says which pool is the
/// deployment's and what tree shape it runs; the relayer says which pool it
/// actually signs against and what depth it actually mirrors. A relayer pointed
/// at a different pool, or mirroring a different shape, is caught here rather
/// than after a proof has been built against it — and a self-hosted or
/// third-party relayer is only trustworthy because this check exists.
function crossCheck(registry: RegistryChainRow, relayer: RelayerChainRow): string[] {
  const disagreements: string[] = [];
  if (
    registry.maspAddress !== undefined &&
    !sameContract(registry.maspAddress, relayer.maspAddress)
  ) {
    disagreements.push(
      `maspAddress: deployment declares ${registry.maspAddress}, relayer writes to ${relayer.maspAddress}`,
    );
  }
  if (registry.treeDepth !== undefined && registry.treeDepth !== relayer.treeDepth) {
    disagreements.push(
      `treeDepth: deployment declares ${registry.treeDepth}, relayer mirrors ${relayer.treeDepth}`,
    );
  }
  return disagreements;
}

/// Fold one chain's two rows and its assets into a usable `ChainEntry`, or
/// report why it cannot be one.
///
/// The rows are the only source; no build-time value stands in for a missing
/// field, so a deployment can never run against stale baked-in addresses.
export function toChainEntry(
  registry: RegistryChainRow,
  relayer: RelayerChainRow,
  assets: AssetRow[],
): ChainEntryResult {
  try {
    return parseChain(registry, relayer, assets);
  } catch (e) {
    // `evmAddress` and `BigInt` both throw on malformed input and zod catches
    // neither: `z.string()` does not check that `scale` is numeric, and
    // `z.number()` does not reject a float, where `BigInt(1.5)` raises
    // `RangeError`. Catching here keeps one bad row from rejecting the whole
    // registry, which is what the per-chain result type is for.
    log.warn("unparseable chain", { chainId: registry.chainId, error: e });
    return {
      ok: false,
      reason: { chainId: safeChainId(registry.chainId), reason: { kind: "unparseable" } },
    };
  }
}

/// Best-effort id for reporting a chain that could not be parsed at all.
///
/// `chainId` is `z.number()` and so already numeric, but a non-integer would
/// still make `BigInt` throw. `Number.isInteger` keeps that from throwing inside
/// the error handler.
function safeChainId(raw: number): bigint {
  return Number.isInteger(raw) ? BigInt(raw) : 0n;
}

function parseChain(
  registry: RegistryChainRow,
  relayer: RelayerChainRow,
  assets: AssetRow[],
): ChainEntryResult {
  const chainId = BigInt(registry.chainId);
  const { rpcUrl, maspAddress, treeDepth } = registry;
  const { relayerAddress } = relayer;

  // A wallet cannot be built without these four, and a guessed value would sign
  // against the wrong deployment. Checked in one condition so the narrowing
  // below follows from it, with the labels derived from the same checks.
  //
  // `maspAddress` and `treeDepth` are taken from the deployment rather than the
  // relayer even though both publish them. They have just been checked equal, so
  // the choice does not change the value — but it does mean a deployment that
  // declares neither cannot silently skip the cross-check by omission.
  if (
    rpcUrl === undefined ||
    maspAddress === undefined ||
    relayerAddress === undefined ||
    treeDepth === undefined
  ) {
    const fields = [
      rpcUrl === undefined && "rpcUrl",
      maspAddress === undefined && "maspAddress",
      relayerAddress === undefined && "relayerAddress",
      treeDepth === undefined && "treeDepth",
    ].filter((m): m is string => typeof m === "string");
    return { ok: false, reason: { chainId, reason: { kind: "incomplete", fields } } };
  }

  const conflicts = crossCheck(registry, relayer);
  if (conflicts.length > 0) {
    return { ok: false, reason: { chainId, reason: { kind: "disagreement", conflicts } } };
  }

  const optional = (v: string | undefined) => (v ? evmAddress(v) : undefined);

  return {
    ok: true,
    entry: {
      chainId,
      chainName: registry.chainName ?? `chain ${chainId}`,
      rpcUrl,
      // Resolved once here rather than at each call site, so a consumer cannot
      // forget the fallback and silently send read traffic to the wallet's
      // endpoint — or, far worse, the reverse.
      readRpcUrl: registry.readRpcUrl ?? rpcUrl,
      maspAddress: evmAddress(maspAddress),
      relayerAddress: evmAddress(relayerAddress),
      permit2Address: optional(registry.permit2Address),
      nativeAdapterAddress: optional(registry.nativeAdapterAddress),
      swapWrapperAddress: optional(registry.swapWrapperAddress),
      treeDepth,
      explorerUrl: registry.explorerUrl,
      tokens: assets.map(toRegisteredAsset),
    },
  };
}

/// Fold the three bodies into the chains this app can use.
///
/// Shared by the network read and the cache read, so a cached bundle passes the
/// same zod schemas, the same merge and the same cross-check as a fresh one. A
/// bundle truncated mid-write or hand-edited is rejected here rather than
/// reaching the app as a half-built `ChainEntry`.
///
/// A chain must appear on both sides to survive. One only the registry lists has
/// no relayer to submit through; one only the relayer lists is undescribed, and
/// the wallet has no rpcUrl to reach it with and nothing to check the relayer
/// against. Both are reported, since which of the two services is behind is the
/// first thing an operator needs to know.
export function entriesFromResponse(body: unknown, source: "network" | "cache"): ChainEntry[] {
  const bundle: RegistryBundle = registryBundle.parse(body);

  const relayers = new Map(bundle.relayerChains.chains.map((c) => [c.chainId, c]));
  const assets = new Map<number, AssetRow[]>();
  for (const a of bundle.assets) {
    const forChain = assets.get(a.chainId);
    if (forChain) forChain.push(a);
    else assets.set(a.chainId, [a]);
  }

  const results = bundle.registryChains.chains.map((registry): ChainEntryResult => {
    const relayer = relayers.get(registry.chainId);
    if (relayer === undefined) {
      return {
        ok: false,
        reason: { chainId: safeChainId(registry.chainId), reason: { kind: "no-relayer" } },
      };
    }
    return toChainEntry(registry, relayer, assets.get(registry.chainId) ?? []);
  });

  const undescribed = bundle.relayerChains.chains
    .filter((c) => !bundle.registryChains.chains.some((r) => r.chainId === c.chainId))
    .map((c) => ({
      chainId: safeChainId(c.chainId),
      reason: { kind: "undescribed" } as const,
    }));

  const skipped = [...results.filter((r) => !r.ok).map((r) => r.reason), ...undescribed];
  if (skipped.length > 0) {
    log.warn("skipping chains this deployment cannot be used on", {
      source,
      chains: skipped.map((s) => ({
        chainId: s.chainId.toString(),
        reason: describeUnusable(s.reason),
      })),
    });
  }

  return results
    .filter((r) => r.ok)
    .map((r) => r.entry)
    .sort((a, b) => Number(a.chainId - b.chainId));
}
