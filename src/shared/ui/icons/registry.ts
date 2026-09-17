import type { ReactElement } from "react";
import { CHAIN_ART, TOKEN_ART } from "./artwork";
import type { Hsl } from "./monogram";

/// What the bundle knows about one token or chain.
interface Brand {
  art: ReactElement;
  color: Hsl;
}

const CHAINS: ReadonlyMap<bigint, Brand> = new Map([
  [1n, { art: CHAIN_ART.ethereum, color: [229, 66, 55] }],
  [10n, { art: CHAIN_ART.optimism, color: [356, 90, 52] }],
  [137n, { art: CHAIN_ART.polygon, color: [262, 71, 55] }],
  [8453n, { art: CHAIN_ART.base, color: [221, 90, 50] }],
  [42161n, { art: CHAIN_ART.arbitrum, color: [201, 84, 46] }],
  [43114n, { art: CHAIN_ART.avalanche, color: [359, 70, 52] }],
]);

/// Keyed by uppercased symbol, so an impersonating token borrows the (decorative) colour.
const TOKENS: ReadonlyMap<string, Brand> = new Map([
  ["ETH", { art: TOKEN_ART.ETH, color: [229, 66, 55] }],
  ["WETH", { art: TOKEN_ART.ETH, color: [229, 66, 55] }],
  ["USDC", { art: TOKEN_ART.USDC, color: [211, 82, 47] }],
  ["USDT", { art: TOKEN_ART.USDT, color: [163, 62, 36] }],
  ["DAI", { art: TOKEN_ART.DAI, color: [38, 88, 46] }],
  ["WBTC", { art: TOKEN_ART.WBTC, color: [29, 90, 48] }],
  ["POL", { art: CHAIN_ART.polygon, color: [262, 71, 55] }],
  ["MATIC", { art: CHAIN_ART.polygon, color: [262, 71, 55] }],
  ["ARB", { art: CHAIN_ART.arbitrum, color: [201, 84, 46] }],
  ["OP", { art: CHAIN_ART.optimism, color: [356, 90, 52] }],
  ["AVAX", { art: CHAIN_ART.avalanche, color: [359, 70, 52] }],
]);

/// Brand for a token symbol, or `undefined` when the bundle does not know it.
export function tokenBrand(symbol: string): Brand | undefined {
  return TOKENS.get(symbol.trim().toUpperCase());
}

/// Brand for a chain id, or `undefined` for one this bundle has no artwork for.
export function chainBrand(chainId: bigint): Brand | undefined {
  return CHAINS.get(chainId);
}
