// The rows of the Shield asset picker. The order is the registry's own, held
// assets first. Nothing is ranked by rate, sorted highest-first, or badged — the
// wallet has no basis for a recommendation, and a sorted list is one. How each
// row states its rate is `rate-label.ts`.
//
// Pure, so the rules are testable without the component or the balance reads.

import type { RegisteredAsset } from "@/config/chains";
import { ethOption } from "./eth-option";

/// One row: a registered asset, or native coin deposited through a WETH id.
export interface ShieldOption {
  /// The picker value — `ethOption(id)` or the id as a decimal string — as the
  /// form's `useEthAssetField` reads it.
  value: string;
  asset: RegisteredAsset;
  asEth: boolean;
  /// What the row is called: "ETH" for native coin, else the registry symbol.
  symbol: string;
  /// Decimals of the balance the deposit draws on: native coin's 18, or the
  /// token's.
  decimals: number;
}

/// Native-coin decimals. Every chain this wallet serves is EVM.
const NATIVE_DECIMALS = 18;

/// Every row the picker offers, in registry order.
///
/// Native coin comes first, one row per WETH id: a chain that registers WETH
/// plain and bound to a venue has two native paths that differ only in the id
/// (see `eth-option.ts`), and the rate column is what tells them apart. Withheld
/// entirely on a chain with no native adapter, where the deposit could not be
/// made.
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

/// Held rows first, each group left in the order given.
///
/// A stable partition, not a sort: within each group the registry's order
/// stands. An unknown balance is not "held" — it has not been read yet, and
/// promoting it would reorder the list under the cursor when the read lands at
/// zero.
export function heldFirst<T>(rows: readonly T[], balanceOf: (row: T) => bigint | undefined): T[] {
  const held: T[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    const b = balanceOf(row);
    (b !== undefined && b > 0n ? held : rest).push(row);
  }
  return [...held, ...rest];
}
