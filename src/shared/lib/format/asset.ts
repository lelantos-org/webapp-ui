// An asset quantity in circuit units, as text.

import { type AssetLabel, type AssetUnits, toBaseUnits } from "@/shared/domain/units";
import { formatDecimal, formatDecimalCompact, formatFixed } from "@/shared/lib/format/number";

/// Inverse of `parseAmountForAsset`: render an asset quantity in circuit units as
/// a decimal string.
///
/// Full precision. This is the text the app writes back into a field — the max
/// button, a denomination chip — and reads back through `parseAmountForAsset`.
export function formatAmountForAsset(circuitUnits: bigint, asset: AssetUnits): string {
  return formatDecimal(toBaseUnits(circuitUnits, asset.scale, asset.index), asset.decimals);
}

/// Fractional digits an asset amount is shown with on screen.
///
/// Balances carry up to the token's own `decimals` — 18 for most — and a figure
/// that long is not read, it is skipped over. Five is enough to tell two
/// amounts apart at a glance and short enough to scan a column of them.
///
/// Display only. Anything the app writes back into a field, signs, or sends
/// keeps full precision: see {@link DenominationOption.text}, whose whole
/// contract is that `parseAmountForAsset` maps it back exactly.
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
    toBaseUnits(circuitUnits, asset.scale, asset.index),
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
  return formatFixed(
    toBaseUnits(circuitUnits, asset.scale, asset.index),
    asset.decimals,
    2,
    maxFrac,
  );
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
  return formatDecimalCompact(
    toBaseUnits(circuitUnits, asset.scale, asset.index),
    asset.decimals,
    maxFrac,
  );
}
