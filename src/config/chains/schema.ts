// The wire shape of the relayer's `/chains`, as zod.
//
// Separate from `parse.ts` so the schema reads as one description of the
// response, uninterrupted by the mapping into `ChainEntry`. Every field past
// `chainId` is optional: a deployment fills the wallet-facing block in
// progressively, and an older relayer serves none of it. Which omissions are
// survivable is `parse.ts`'s decision, not the schema's.

import { z } from "zod";

/// Present iff the pool routes this asset to a yield venue.
///
/// Every figure is a decimal string, each exceeding what a JSON number holds
/// safely. The relayer carries `gross` and `supply` so a *charge* can be sized
/// exactly; this app renders rather than charges, so it reads `index` and leaves
/// the pair to the SDK.
export const yieldStateRow = z.object({
  venue: z.string(),
  gross: z.string(),
  supply: z.string(),
  index: z.string(),
  halted: z.boolean(),
});

const tokenRow = z.object({
  assetId: z.number(),
  token: z.string(),
  /// Decimal string: `scale` exceeds what a JSON number holds safely.
  scale: z.string(),
  decimals: z.number().optional(),
  symbol: z.string().optional(),
  /// Absent from a relayer predating the yield mixin, and from every asset held
  /// as plain custody.
  yieldState: yieldStateRow.optional(),
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

export const chainsResponse = z.object({ chains: z.array(chainRow) });
export type ChainRow = z.infer<typeof chainRow>;
export type TokenRow = z.infer<typeof tokenRow>;
