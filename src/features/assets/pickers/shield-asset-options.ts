import type { RegisteredAsset } from "@/config/chains";
import { ethOption } from "./eth-option";

/// One row: a registered asset, or native coin deposited through a WETH id.
export interface ShieldOption {
  /// `ethOption(id)` or the id as a decimal string.
  value: string;
  asset: RegisteredAsset;
  asEth: boolean;
  /// What the row is called: "ETH" for native coin, else the registry symbol.
  symbol: string;
  /// Decimals of the balance the deposit draws on.
  decimals: number;
}

const NATIVE_DECIMALS = 18;

/// Every row the picker offers: native coin per WETH id, then the registry. Never by rate.
export function shieldOptions(
  assets: readonly RegisteredAsset[],
  nativeEth: boolean,
): ShieldOption[] {
  const native = nativeEth
    ? assets
        .filter((a) => a.isWeth)
        .map((a) => ({
          value: ethOption(a.id),
          asset: a,
          asEth: true,
          symbol: "ETH",
          decimals: NATIVE_DECIMALS,
        }))
    : [];
  const tokens = assets.map((a) => ({
    value: a.id.toString(),
    asset: a,
    asEth: false,
    symbol: a.symbol,
    decimals: a.decimals,
  }));
  return [...native, ...tokens];
}

/// Held rows first, each group in the given order. An unknown balance counts as not held.
export function heldFirst<T>(rows: readonly T[], balanceOf: (row: T) => bigint | undefined): T[] {
  const held: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    const b = balanceOf(row);
    (b !== undefined && b > 0n ? held : rest).push(row);
  }
  return [...held, ...rest];
}
