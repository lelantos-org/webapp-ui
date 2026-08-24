// Brand colours and labels for the tokens and chains this deployment expects.
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
// that is missing degrades to a hashed colour, and nothing downstream branches
// on whether a token was recognised.

import type { Hsl } from "@/features/icons/monogram";

/// What the bundle knows about one token or chain.
interface Brand {
  /// Brand colour as HSL, replacing the hash-derived hue.
  color: Hsl;
  /// Shown in the mark instead of the first two characters of the symbol, when
  /// the symbol's own prefix is not the recognisable short form — `AV` for
  /// Avalanche, where `AVAX` is what people read.
  label?: string;
}

/// Chains this deployment can serve, keyed by EVM chain id.
///
/// The six that `prices::llama_chain` can price, which is also the set the
/// relayer is deployed against. A chain absent here — the local anvil stack at
/// 31337 included — still renders, with a hue derived from its id.
const CHAINS: ReadonlyMap<bigint, Brand> = new Map([
  [1n, { color: [229, 66, 55], label: "ET" }],
  [10n, { color: [356, 90, 52], label: "OP" }],
  [137n, { color: [262, 71, 55], label: "PO" }],
  [8453n, { color: [221, 90, 50], label: "BA" }],
  [42161n, { color: [201, 84, 46], label: "AR" }],
  [43114n, { color: [359, 70, 52], label: "AV" }],
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
  ["ETH", { color: [229, 66, 55] }],
  ["WETH", { color: [229, 66, 55] }],
  ["USDC", { color: [211, 82, 47] }],
  ["USDT", { color: [163, 62, 36] }],
  ["DAI", { color: [38, 88, 46] }],
  ["WBTC", { color: [29, 90, 48] }],
  ["BTC", { color: [29, 90, 48] }],
  ["POL", { color: [262, 71, 55] }],
  ["MATIC", { color: [262, 71, 55] }],
  ["ARB", { color: [201, 84, 46] }],
  ["OP", { color: [356, 90, 52] }],
  ["AVAX", { color: [359, 70, 52] }],
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
