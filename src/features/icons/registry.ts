// What the bundle knows about the tokens and chains this deployment expects.
//
// Bundled rather than served. The relayer has no icon to give: `assets` holds
// only what the indexer can read on-chain (`symbol()`, `decimals()`), and an
// ERC-20 has no `icon()`. Sourcing logos from a CDN at runtime would need the
// `img-src 'self' data:` CSP in `index.html` widened to that host, and would
// tell it which assets a user holds — the one thing a shielded wallet exists
// to keep quiet. So the artwork ships in the bundle, costs no request, and
// works offline in the PWA.
//
// Everything here is a *fallback improvement*, never a requirement: an entry
// that is missing degrades to a coloured monogram, and nothing downstream
// branches on whether a token was recognised.

import type { ReactElement } from "react";
import { CHAIN_ART, TOKEN_ART } from "@/features/icons/artwork";
import type { Hsl } from "@/features/icons/monogram";

/// What the bundle knows about one token or chain.
interface Brand {
  /// The real mark, drawn instead of a monogram.
  art: ReactElement;
  /// Brand colour as HSL, for the surfaces that still need one — today the
  /// skeleton and any future tinted container. Kept beside the artwork so the
  /// two cannot drift.
  color: Hsl;
}

/// Chains this deployment can serve, keyed by EVM chain id.
///
/// The six that `prices::llama_chain` can price, which is also the set the
/// relayer is deployed against. A chain absent here — the local anvil stack at
/// 31337 included — still renders, with a hue derived from its id.
const CHAINS: ReadonlyMap<bigint, Brand> = new Map([
  [1n, { art: CHAIN_ART.ethereum, color: [229, 66, 55] }],
  [10n, { art: CHAIN_ART.optimism, color: [356, 90, 52] }],
  [137n, { art: CHAIN_ART.polygon, color: [262, 71, 55] }],
  [8453n, { art: CHAIN_ART.base, color: [221, 90, 50] }],
  [42161n, { art: CHAIN_ART.arbitrum, color: [201, 84, 46] }],
  [43114n, { art: CHAIN_ART.avalanche, color: [359, 70, 52] }],
]);

/// Tokens keyed by uppercased symbol rather than by address.
///
/// Deliberately not `(chainId, address)`: USDC is USDC on all six chains, and
/// an address-keyed table would need six rows per token and would silently
/// stop matching the day a deployment registers the same asset from a
/// different bridge. The symbol comes from the token's own `symbol()` via the
/// indexer, so it is the chain's answer, not ours.
///
/// The cost is that a token impersonating a symbol borrows its colour. That is
/// acceptable here because the colour is decoration — the address is shown and
/// verified elsewhere, and no flow keys off this.
const TOKENS: ReadonlyMap<string, Brand> = new Map([
  // WETH takes ether's mark because it *is* ether; `chains.ts` derives
  // `isWeth` from this same symbol, so the two agree by construction.
  ["ETH", { art: TOKEN_ART.ETH, color: [229, 66, 55] }],
  ["WETH", { art: TOKEN_ART.ETH, color: [229, 66, 55] }],
  ["USDC", { art: TOKEN_ART.USDC, color: [211, 82, 47] }],
  ["USDT", { art: TOKEN_ART.USDT, color: [163, 62, 36] }],
  ["DAI", { art: TOKEN_ART.DAI, color: [38, 88, 46] }],
  ["WBTC", { art: TOKEN_ART.WBTC, color: [29, 90, 48] }],
  // The gas tokens of the chains served, which a deployment may register as
  // ERC-20s. They reuse the network artwork rather than carrying a second copy.
  ["POL", { art: CHAIN_ART.polygon, color: [262, 71, 55] }],
  ["MATIC", { art: CHAIN_ART.polygon, color: [262, 71, 55] }],
  ["ARB", { art: CHAIN_ART.arbitrum, color: [201, 84, 46] }],
  ["OP", { art: CHAIN_ART.optimism, color: [356, 90, 52] }],
  ["AVAX", { art: CHAIN_ART.avalanche, color: [359, 70, 52] }],
]);

/// Brand for a token symbol, or `undefined` when the bundle does not know it.
///
/// Tolerates the `#<id>` placeholder the registry falls back to for an asset
/// whose `symbol()` the indexer has not resolved: it simply matches nothing.
export function tokenBrand(symbol: string): Brand | undefined {
  return TOKENS.get(symbol.trim().toUpperCase());
}

/// Brand for a chain id, or `undefined` for one this bundle predates.
export function chainBrand(chainId: bigint): Brand | undefined {
  return CHAINS.get(chainId);
}
