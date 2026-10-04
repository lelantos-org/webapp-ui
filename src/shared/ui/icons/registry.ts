import type { ReactElement } from "react";
import { CHAIN_ART, TOKEN_ART } from "./artwork";

interface Brand {
  art: ReactElement;
}

const CHAINS: ReadonlyMap<bigint, Brand> = new Map([
  [1n, { art: CHAIN_ART.ethereum }],
  [10n, { art: CHAIN_ART.optimism }],
  [137n, { art: CHAIN_ART.polygon }],
  [8453n, { art: CHAIN_ART.base }],
  [42161n, { art: CHAIN_ART.arbitrum }],
  [43114n, { art: CHAIN_ART.avalanche }],
]);

/// Keyed by uppercased symbol, so an impersonating token gets the brand. The mark is decorative.
const TOKENS: ReadonlyMap<string, Brand> = new Map([
  ["ETH", { art: TOKEN_ART.ETH }],
  ["WETH", { art: TOKEN_ART.ETH }],
  ["USDC", { art: TOKEN_ART.USDC }],
  ["USDT", { art: TOKEN_ART.USDT }],
  ["DAI", { art: TOKEN_ART.DAI }],
  ["WBTC", { art: TOKEN_ART.WBTC }],
  ["POL", { art: CHAIN_ART.polygon }],
  ["MATIC", { art: CHAIN_ART.polygon }],
  ["ARB", { art: CHAIN_ART.arbitrum }],
  ["OP", { art: CHAIN_ART.optimism }],
  ["AVAX", { art: CHAIN_ART.avalanche }],
]);

export function tokenBrand(symbol: string): Brand | undefined {
  return TOKENS.get(symbol.trim().toUpperCase());
}

export function chainBrand(chainId: bigint): Brand | undefined {
  return CHAINS.get(chainId);
}
