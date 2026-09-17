import { type CircuitAmount, isWalletError, parseAmount, toBaseUnits } from "@lelantos-org/sdk";
import type { AssetLabel, AssetUnits } from "@/shared/domain/units";
import {
  formatDecimal,
  formatDecimalCompact,
  formatFixed,
  isDecimalString,
  normalizeNumericInput,
} from "@/shared/lib/format/number";

/// Circuit units as full-precision grouped decimal text; `parseAmountInput` inverts it exactly.
export function formatAmountForAsset(circuitUnits: bigint, asset: AssetUnits): string {
  return formatDecimal(toBaseUnits(circuitUnits, asset), asset.decimals);
}

/// Parse typed text into circuit units of `asset`. Throws an `Error` worded for the amount field.
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

/// Fractional digits an amount is shown with on screen. Display only: never write it back.
export const DISPLAY_FRAC_DIGITS = 5;

/// Circuit units as display text capped at {@link DISPLAY_FRAC_DIGITS}, truncating toward zero.
export function formatAmountForDisplay(circuitUnits: bigint, asset: AssetUnits): string {
  return formatDecimalCompact(
    toBaseUnits(circuitUnits, asset),
    asset.decimals,
    DISPLAY_FRAC_DIGITS,
  );
}

/// `${formattedAmount} ${symbol}` for display, or the bare figure when there is no symbol.
export function formatAssetAmount(
  amount: bigint,
  asset: AssetUnits & Partial<Pick<AssetLabel, "symbol">>,
): string {
  const formatted = formatAmountForDisplay(amount, asset);
  return asset.symbol ? `${formatted} ${asset.symbol}` : formatted;
}

/// Circuit units with two to `maxFrac` fractional places, as a money screen sets a figure.
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

/// Circuit units as compact text with up to `maxFrac` places.
export function formatAssetCompact(circuitUnits: bigint, asset: AssetUnits, maxFrac = 6): string {
  return formatDecimalCompact(toBaseUnits(circuitUnits, asset), asset.decimals, maxFrac);
}
