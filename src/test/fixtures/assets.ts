// Registry asset fixtures.
//
// One builder, so a new required field on `RegisteredAsset` is added here once
// rather than to every file that needs an asset, and so fixtures stop being cast
// into shape.

import type { EvmAddress } from "@lelantos-org/sdk";
import { RAY } from "@lelantos-org/sdk/protocol";
import type { RegisteredAsset } from "@/config/chains";

/// A distinct, well-formed token address per asset id: `0x000…0<id>`.
function tokenAddress(id: bigint): EvmAddress {
  return `0x${id.toString().padStart(40, "0")}` as EvmAddress;
}

/// Overrides for `makeAsset`. `token` takes any string, because several suites
/// deliberately use short or mixed-case spellings to exercise address joins.
export type AssetOverrides = Omit<Partial<RegisteredAsset>, "token"> & { token?: string };

/// A plain-custody asset: 18 decimals, `scale` 1, index at `RAY`, no venue.
///
/// `isWeth` follows the symbol (case-insensitively), which is how the registry
/// itself matches the wrapped native token.
export function makeAsset(id: bigint, symbol: string, over: AssetOverrides = {}): RegisteredAsset {
  const { token, ...rest } = over;
  return {
    id,
    token: (token ?? tokenAddress(id)) as EvmAddress,
    isWeth: symbol.toUpperCase() === "WETH",
    symbol,
    decimals: 18,
    scale: 1n,
    index: RAY,
    yieldEnabled: false,
    yieldHalted: false,
    ...rest,
  };
}

/// USDC at id 1 — 6 decimals, `scale` 1, so circuit units and base units are
/// the same and arithmetic in a test reads without a conversion in the way.
export const USDC_ASSET: RegisteredAsset = makeAsset(1n, "USDC", { decimals: 6 });
