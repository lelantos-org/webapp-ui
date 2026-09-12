// The wire shapes the registry is assembled from, as zod.
//
// Three responses, from two services. registry-webserver answers what each chain
// *is* (`/v1/chains`) and what is registered on it (`/v1/assets`); the relayer
// answers what one relayer will do on it (`/chains`). Neither service is the
// authority on the other's half, which is the whole point of the split: a person
// self-hosting a relayer is configured only with what they operate, and cannot
// assert the deployment's account of a chain.
//
// Separate from `parse.ts` so these read as one description of each response,
// uninterrupted by the merge into `ChainEntry`. Which omissions are survivable
// is `parse.ts`'s decision, not the schema's.

import { z } from "zod";
import { httpUrl } from "@/config/url";

// ── registry-webserver: /v1/chains ──────────────────────────────────────────

/// An http(s) URL, or absent — including when the value was present but not one.
///
/// `.catch` rather than a bare failure, because these rows arrive one per chain
/// inside a single response that `registryBundle.parse` validates as a whole. A
/// throw would take every chain down over one bad field on one of them, turning
/// an operator's typo into a total boot failure; degrading to `undefined` keeps
/// the blast radius at the field.
///
/// What that degrades *to* is what makes it safe, and it differs per field.
/// A dropped `explorerUrl` costs a link. A dropped `rpcUrl` is required, so
/// `parseChain` reports the chain `incomplete` and skips it — logged, per-chain,
/// and the same path a genuinely absent value takes. A dropped `readRpcUrl`
/// falls back to `rpcUrl`. In no case does an unusable URL reach a sink.
const optionalHttpUrl = httpUrl.optional().catch(undefined);

/// One chain, as the deployment declares it.
///
/// Everything past `chainId` is optional: an operator fills the block in
/// progressively, and a field left undescribed is absent rather than null so a
/// client can tell it from one described as empty.
///
/// The three URL fields are checked for scheme, not merely for being strings.
///
/// They are the only URLs in the app that arrive over the network, and each is
/// handed somewhere that acts on it: `explorerUrl` reaches `href` and
/// `window.open`, where `javascript:` would be script execution in this origin,
/// and `rpcUrl` is registered in the user's browser wallet via
/// `wallet_addEthereumChain`. A registry hostile enough to send `javascript:`
/// already controls the addresses rendered beside it, so this is depth rather
/// than a lone barrier — but it is the boundary where a scheme can be rejected
/// at all.
const registryChainRow = z.object({
  chainId: z.number(),
  chainName: z.string().optional(),
  /// Browser-reachable RPC, not the endpoint the service reads the chain with.
  /// This is what `wallet_addEthereumChain` registers, so it must stay a
  /// general-purpose endpoint; see `readRpcUrl`.
  rpcUrl: optionalHttpUrl,
  /// Read-only RPC for the SDK's own traffic, normally the caching proxy.
  /// Absent falls back to `rpcUrl`.
  ///
  /// Page-relative in every stack that fronts the proxy on the app's own origin
  /// (`/rpc/v1/31337`), which `httpUrl` resolves before judging the scheme.
  readRpcUrl: optionalHttpUrl,
  explorerUrl: optionalHttpUrl,
  permit2Address: z.string().optional(),
  /// The pool the deployment declares. Cross-checked against the one the
  /// relayer reports writing to — see `crossCheck` in `parse.ts`.
  maspAddress: z.string().optional(),
  /// The tree shape the deployment declares. Cross-checked the same way, since
  /// a proof is built against it.
  treeDepth: z.number().optional(),
  nativeAdapterAddress: z.string().optional(),
  swapWrapperAddress: z.string().optional(),
});

const registryChainsResponse = z.object({ chains: z.array(registryChainRow) });
export type RegistryChainRow = z.infer<typeof registryChainRow>;

// ── registry-webserver: /v1/assets ──────────────────────────────────────────

/// Present iff the pool routes this asset to a yield venue.
///
/// Every figure is a decimal string, each exceeding what a JSON number holds
/// safely. `gross` and `supply` are carried so a *charge* can be sized exactly;
/// this app renders rather than charges, so it reads `index` and leaves the pair
/// to the SDK.
export const yieldStateRow = z.object({
  venue: z.string(),
  gross: z.string(),
  supply: z.string(),
  index: z.string(),
  halted: z.boolean(),
  /// Estimated annual rate for a note holder, in basis points, net of the
  /// pool's performance fee and idle buffer.
  ///
  /// Absent — never zero — when it could not be measured: an RPC without archive
  /// state, a venue younger than the window, or a reading too wild to be a rate.
  /// A number rather than a decimal string: a rate in bps is a small integer,
  /// unlike every other figure here.
  apyBps: z.number().finite().optional(),
  /// Seconds the two readings behind `apyBps` actually spanned. Present iff
  /// `apyBps` is, and shown to the user, so the window is the measured one
  /// rather than one the client assumed.
  apyWindowS: z.number().finite().optional(),
  /// The venue's ERC-4626 vault `name()`, as the vault reports it. Absent until
  /// the indexer has read it, or for a vault without one.
  vaultName: z.string().optional(),
});

/// One row of `/v1/assets`, which is a flat array across every chain rather than
/// a list nested under one. `chainId` is what groups them.
const assetRow = z.object({
  chainId: z.number(),
  assetId: z.number(),
  token: z.string(),
  /// Decimal string: `scale` exceeds what a JSON number holds safely.
  scale: z.string(),
  decimals: z.number().optional(),
  symbol: z.string().optional(),
  /// Absent from every asset held as plain custody.
  yieldState: yieldStateRow.optional(),
});

const assetsResponse = z.array(assetRow);
export type AssetRow = z.infer<typeof assetRow>;

// ── relayer: /chains ────────────────────────────────────────────────────────

/// What one relayer reports about itself on a chain.
///
/// Carries nothing describing the deployment — that is the two responses
/// above's job. `maspAddress` and `treeDepth` appear in both places on purpose, and
/// are the only overlap: they are what a wallet compares before trusting this
/// relayer with a proof.
///
/// Both are required here, unlike on the registry side. They are readings this
/// relayer makes of itself — the pool it signs against, the tree it mirrors —
/// so a relayer that cannot state them has nothing a wallet can check.
const relayerChainRow = z.object({
  chainId: z.number(),
  maspAddress: z.string(),
  treeDepth: z.number(),
  /// SNARK-bound: the pool rejects a proof naming anyone else.
  relayerAddress: z.string().optional(),
});

const relayerChainsResponse = z.object({ chains: z.array(relayerChainRow) });
/// Inferred from the row rather than indexed back out of the response, matching
/// how `RegistryChainRow` and `AssetRow` are derived above.
export type RelayerChainRow = z.infer<typeof relayerChainRow>;

// ── the three together ──────────────────────────────────────────────────────

/// The three bodies the registry is built from, as cached and as parsed.
///
/// Kept as one value so the `localStorage` copy stores exactly what the network
/// returned and re-runs the same merge on read. Storing merged entries instead
/// would both skip that validation and fail outright: `ChainEntry` holds
/// bigints, which `JSON.stringify` refuses.
export const registryBundle = z.object({
  registryChains: registryChainsResponse,
  assets: assetsResponse,
  relayerChains: relayerChainsResponse,
});

export type RegistryBundle = z.infer<typeof registryBundle>;
