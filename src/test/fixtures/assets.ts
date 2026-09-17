import type { EvmAddress } from "@lelantos-org/sdk";
import { RAY } from "@lelantos-org/sdk/protocol";
import type { RegisteredAsset } from "@/config/chains";

function tokenAddress(id: bigint): EvmAddress {
  return `0x${id.toString().padStart(40, "0")}` as EvmAddress;
}

/// Overrides for `makeAsset`; `token` takes any string to exercise address normalisation.
export type AssetOverrides = Omit<Partial<RegisteredAsset>, "token"> & { token?: string };

/// A plain-custody asset: 18 decimals, `scale` 1, index at `RAY`, no venue; `isWeth` follows the symbol.
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

/// USDC at id 1: 6 decimals, `scale` 1, so circuit and base units coincide.
export const USDC_ASSET: RegisteredAsset = makeAsset(1n, "USDC", { decimals: 6 });
