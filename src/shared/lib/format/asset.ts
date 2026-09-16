// An asset quantity in circuit units, as text.

import { type CircuitAmount, isWalletError, parseAmount, toBaseUnits } from "@lelantos-org/sdk";
import type { AssetLabel, AssetUnits } from "@/shared/domain/units";
import {
  formatDecimal,
  formatDecimalCompact,
  formatFixed,
  isDecimalString,
  normalizeNumericInput,
} from "@/shared/lib/format/number";

/// Render an asset quantity in circuit units as a decimal string: the SDK's
/// `formatAmount`, with the integer part grouped.
///
/// Full precision. This is the text the app writes back into a field — the max
/// button, a denomination chip — and reads back through `parseAmountInput`, which
/// strips the grouping and inverts it exactly.
export function formatAmountForAsset(circuitUnits: bigint, asset: AssetUnits): string {
  return formatDecimal(toBaseUnits(circuitUnits, asset), asset.decimals);
}

/// Parse what a user typed into circuit units of `asset`: the inverse of
/// `formatAmountForAsset`.
///
/// The conversion is the SDK's `parseAmount`, whose default rounding is the one
/// an amount field needs: exact on a plain asset, where anything finer than one
/// unit was never representable and truncating it would short the user; up on a
/// yield asset. There a unit is worth a non-round number of base units, so the
/// text the "max" button and the denomination chips write sits just under the
/// exact worth, and rounding up is what reads it back as the same unit count —
/// never more than the balance it was formatted from.
///
/// Around it, what a text field adds: separators stripped, and digits past the
/// token's own `decimals` refused on every asset rather than rounded away.
///
/// Throws an `Error` worded for the amount field.
export function parseAmountInput(input: string, asset: AssetUnits): CircuitAmount {
  const text = normalizeNumericInput(input);
  if (!isDecimalString(text)) throw new Error("amount must be a non-negative number");
  const frac = text.split(".")[1] ?? "";
  if (frac.length > asset.decimals) {
    throw new Error(
      asset.decimals === 0
        ? "this asset has no fractional units"
        : `too many fractional digits (max ${asset.decimals})`,
    );
  }
  try {
    return parseAmount(text, asset);
  } catch (e) {
    if (isWalletError(e, "INVALID_ARGUMENT")) {
      throw new Error("amount precision exceeds asset granularity");
    }
    throw e;
  }
}

/// Fractional digits an asset amount is shown with on screen.
///
/// Balances carry up to the token's own `decimals` — 18 for most — and a figure
/// that long is not read, it is skipped over. Five is enough to tell two
/// amounts apart at a glance and short enough to scan a column of them.
///
/// Display only. Anything the app writes back into a field, signs, or sends
/// keeps full precision: see {@link DenominationOption.text}, whose whole
/// contract is that `parseAmountInput` maps it back exactly.
export const DISPLAY_FRAC_DIGITS = 5;

/// An asset quantity for display: circuit units → a decimal string capped at
/// {@link DISPLAY_FRAC_DIGITS}.
///
/// Truncates toward zero rather than rounding, so a balance is never shown as
/// larger than it is. Dust below the cap still shows significant digits instead
/// of collapsing to "0" — see `compactFracDigits`; a balance that exists must
/// not read as a balance that does not.
export function formatAmountForDisplay(circuitUnits: bigint, asset: AssetUnits): string {
  return formatDecimalCompact(
    toBaseUnits(circuitUnits, asset),
    asset.decimals,
    DISPLAY_FRAC_DIGITS,
  );
}

/// `${formattedAmount} ${symbol}` for a registered asset.
///
/// `symbol` is optional so the placeholder metas the forms fall back to render a
/// bare figure rather than a trailing `undefined`.
export function formatAssetAmount(
  amount: bigint,
  asset: AssetUnits & Partial<Pick<AssetLabel, "symbol">>,
): string {
  // Display-capped: every caller is a caption — a balance hint, a ladder
  // notice, a claim-link summary. Nothing reads this back. What *is* read back
  // — the max button's write and a chip's `text` — goes through
  // `formatAmountForAsset` directly and keeps full precision.
  const formatted = formatAmountForDisplay(amount, asset);
  return asset.symbol ? `${formatted} ${asset.symbol}` : formatted;
}

/// An asset quantity in circuit units at two places at least and `maxFrac` at
/// most — "250.00" — as a money screen sets a figure; see `formatFixed`.
export function formatAssetFixed(
  circuitUnits: bigint,
  asset: AssetUnits,
  maxFrac?: number,
): string {
  return formatFixed(toBaseUnits(circuitUnits, asset), asset.decimals, 2, maxFrac);
}

/// `formatFixed` for a figure already in base units, with its symbol: "0.25 USDC".
export function formatBaseFixed(
  base: bigint,
  asset: { decimals: number; symbol: string },
  maxFrac: number,
): string {
  return `${formatFixed(base, asset.decimals, 2, maxFrac)} ${asset.symbol}`;
}

/// An asset quantity in circuit units, compact at up to `maxFrac` places; see
/// `formatDecimalCompact`.
export function formatAssetCompact(circuitUnits: bigint, asset: AssetUnits, maxFrac = 6): string {
  return formatDecimalCompact(toBaseUnits(circuitUnits, asset), asset.decimals, maxFrac);
}
