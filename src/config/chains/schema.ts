import { z } from "zod";
import { httpUrl } from "@/config/url";

// ── protocol-webserver: /v1/chains ──────────────────────────────────────────

/// An http(s) URL, or `undefined` when absent or invalid, so one bad field cannot fail every chain.
const optionalHttpUrl = httpUrl.optional().catch(undefined);

/// One chain, as protocol-webserver declares it. URL schemes are checked: they reach `href` and the wallet.
const registryChainRow = z.object({
  chainId: z.number(),
  chainName: z.string().optional(),
  /// Registered in the user's wallet; see `readRpcUrl`.
  rpcUrl: optionalHttpUrl,
  /// Read-only RPC for the SDK, normally the caching proxy; falls back to `rpcUrl`.
  readRpcUrl: optionalHttpUrl,
  explorerUrl: optionalHttpUrl,
  permit2Address: z.string().optional(),
  /// Cross-checked against the relayer's in `parse.ts`.
  maspAddress: z.string().optional(),
  /// Cross-checked against the relayer's in `parse.ts`.
  treeDepth: z.number().optional(),
  nativeAdapterAddress: z.string().optional(),
  swapWrapperAddress: z.string().optional(),
  /// Governance contracts; a zero address is read as absent.
  governorAddress: z.string().optional(),
  govTokenAddress: z.string().optional(),
  timelockAddress: z.string().optional(),
});

const registryChainsResponse = z.object({ chains: z.array(registryChainRow) });
export type RegistryChainRow = z.infer<typeof registryChainRow>;

// ── protocol-webserver: /v1/assets ──────────────────────────────────────────

/// Yield state, present iff the pool routes the asset to a venue. Figures are decimal strings.
export const yieldStateRow = z.object({
  venue: z.string(),
  gross: z.string(),
  supply: z.string(),
  index: z.string(),
  halted: z.boolean(),
  /// Net estimated annual rate in bps; absent (never zero) when unmeasurable.
  apyBps: z.number().finite().optional(),
  /// Seconds the readings behind `apyBps` spanned.
  apyWindowS: z.number().finite().optional(),
  vaultName: z.string().optional(),
});

const assetRow = z.object({
  chainId: z.number(),
  assetId: z.number(),
  token: z.string(),
  scale: z.string(),
  decimals: z.number().optional(),
  symbol: z.string().optional(),
  yieldState: yieldStateRow.optional(),
});

const assetsResponse = z.array(assetRow);
export type AssetRow = z.infer<typeof assetRow>;

// ── relayer: /chains ────────────────────────────────────────────────────────

/// What one relayer reports about itself; `maspAddress` and `treeDepth` are what a wallet cross-checks.
const relayerChainRow = z.object({
  chainId: z.number(),
  maspAddress: z.string(),
  treeDepth: z.number(),
  relayerAddress: z.string().optional(),
});

const relayerChainsResponse = z.object({ chains: z.array(relayerChainRow) });
export type RelayerChainRow = z.infer<typeof relayerChainRow>;

// ── the three together ──────────────────────────────────────────────────────

/// The three bodies the registry is built from, as fetched and as cached.
export const registryBundle = z.object({
  registryChains: registryChainsResponse,
  assets: assetsResponse,
  relayerChains: relayerChainsResponse,
});

export type RegistryBundle = z.infer<typeof registryBundle>;
