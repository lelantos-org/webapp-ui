import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
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

/// Last-resort decimals from `scale`; right only when `scale = 10^d`.
function scaleToDecimals(scale: bigint): number {
  let d = 0;
  for (let s = scale; s > 1n; s /= 10n) d++;
  return d;
}

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

const PLAIN_CUSTODY = { index: RAY, yieldEnabled: false, yieldHalted: false } as const;

/// The yield fields of an asset, degrading to plain custody rather than dropping it.
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
    // `z.string()` does not check that `index` is numeric.
    return PLAIN_CUSTODY;
  }
}

/// Mirrors protocol-webserver's `MIN_WINDOW_SECONDS`; a shorter window is malformed.
const MIN_WINDOW_S = 2 * 86_400;

/// The APY fields: both rate and window, or neither.
function toApyFields(
  bps: number | undefined,
  windowS: number | undefined,
): Pick<RegisteredAsset, "apy"> {
  if (bps === undefined || windowS === undefined || windowS < MIN_WINDOW_S) return {};
  return { apy: { rate: bps / 10_000, windowDays: Math.round(windowS / 86_400) } };
}

/// Why a chain cannot be used; `disagreement` may mean a relayer points at the wrong pool.
export type UnusableReason =
  | {
      kind: "incomplete";
      fields: string[];
    }
  | {
      kind: "disagreement";
      conflicts: string[];
    }
  | { kind: "unparseable" }
  | { kind: "no-relayer" }
  | { kind: "undescribed" };

interface UnusableChain {
  chainId: bigint;
  reason: UnusableReason;
}

/// One reason as a line of log output.
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

function sameContract(a: string, b: string): boolean {
  return sameAddress(evmAddress(a), evmAddress(b));
}

// The safety check for a third-party relayer: same pool and tree depth as the deployment declares.
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

/// Fold one chain's two rows and its assets into a `ChainEntry`, or say why it is unusable.
export function toChainEntry(
  registry: RegistryChainRow,
  relayer: RelayerChainRow,
  assets: AssetRow[],
): ChainEntryResult {
  try {
    return parseChain(registry, relayer, assets);
  } catch (e) {
    // `evmAddress`/`BigInt` throw on rows zod let through; fail this chain only.
    log.warn("unparseable chain", { chainId: registry.chainId, error: e });
    return {
      ok: false,
      reason: { chainId: safeChainId(registry.chainId), reason: { kind: "unparseable" } },
    };
  }
}

function safeChainId(raw: number): bigint {
  return Number.isInteger(raw) ? BigInt(raw) : 0n;
}

const ZERO_ADDRESS = /^0x0{40}$/i;

// Zero address means not deployed: calls to an empty account would silently succeed.
function optionalContract(v: string | undefined): EvmAddress | undefined {
  if (!v || ZERO_ADDRESS.test(v)) return undefined;
  return evmAddress(v);
}

function parseChain(
  registry: RegistryChainRow,
  relayer: RelayerChainRow,
  assets: AssetRow[],
): ChainEntryResult {
  const chainId = BigInt(registry.chainId);
  const { rpcUrl, maspAddress, treeDepth } = registry;
  const { relayerAddress } = relayer;

  // Never guess these: a wrong value signs against the wrong deployment.
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
      readRpcUrl: registry.readRpcUrl ?? rpcUrl,
      maspAddress: evmAddress(maspAddress),
      relayerAddress: evmAddress(relayerAddress),
      permit2Address: optional(registry.permit2Address),
      nativeAdapterAddress: optional(registry.nativeAdapterAddress),
      swapWrapperAddress: optional(registry.swapWrapperAddress),
      governorAddress: optionalContract(registry.governorAddress),
      govTokenAddress: optionalContract(registry.govTokenAddress),
      timelockAddress: optionalContract(registry.timelockAddress),
      treeDepth,
      explorerUrl: registry.explorerUrl,
      tokens: assets.map(toRegisteredAsset),
    },
  };
}

/// Validate and merge the three bodies into usable chains; shared by network and cache reads.
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
