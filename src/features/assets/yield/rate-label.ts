// How a venue's rate is labelled, wherever the wallet states one: the Shield
// picker, the portfolio's asset detail and the empty wallet's list.
//
// Three rules every surface keeps:
//
//   * A rate is never shown without its window, and the window is the one the
//     registry measured (`apy.windowDays`), never a literal.
//   * Not measurable is not zero: a yield asset without a rate shows a dash.
//   * Paused still means backed: a halted venue has degraded to plain custody,
//     and is said so in warn, never as an error.
//
// The measurement is the relayer's: it reads the venue's ERC-4626 vault at two
// blocks a week apart and publishes the annualized result on `/chains`. It lives
// there rather than here for two reasons the browser cannot fix. A public RPC
// prunes state within hours, so the historical reads the estimate needs are
// refused in a wallet and answered from the relayer's own node; and a rate is a
// property of the venue, identical for every holder, so measuring it once per
// deployment rather than once per open tab is simply what it is.
//
// What is left in the client is the labelling — and the care that goes with it.
// The figure describes the venue, not the wallet: a deposit made today into a
// venue that ran at 4% all year has earned nothing. The wallet's own return is
// the `earned` column, and the two must never be read as the same claim.

import type { RegisteredAsset } from "@/config/chains";
import { formatPercent } from "@/shared/lib/format/money";

/// The rate column for one asset.
export type RateLabel =
  /// "4.18% / yr", "measured over 9d".
  | { kind: "rate"; rate: string; window: string }
  /// A yield asset whose rate cannot be measured: a dash, never 0%.
  | { kind: "unmeasured" }
  /// "paused", "still fully backed".
  | { kind: "paused" }
  /// Held as plain custody: "does not earn".
  | { kind: "plain" };

/// The words a rate label states beside, or in place of, a figure.
///
/// Shared by `assetRateTag` and `RateLabelView`, so a surface that draws them
/// and one that flattens them to text cannot word the same state differently.
export const RATE_WORDS = {
  paused: "paused",
  backed: "still fully backed",
  unmeasured: "rate cannot be measured",
  plain: "does not earn",
} as const;

export function rateLabel(asset: RegisteredAsset): RateLabel {
  if (!asset.yieldEnabled) return { kind: "plain" };
  if (asset.yieldHalted) return { kind: "paused" };
  if (!asset.apy) return { kind: "unmeasured" };
  return {
    kind: "rate",
    rate: `${formatPercent(asset.apy.rate)} / yr`,
    window: `measured over ${formatWindowShort(asset.apy.windowDays)}`,
  };
}

/// The measured window in the space of a table cell or a badge: `7d`, `9d`.
///
/// Read from the response rather than fixed here, and never written as a literal.
/// The relayer aims at a week but publishes what its two readings actually
/// spanned, and a column headed "30d" over a nine-day measurement is stating
/// something nobody measured.
export function formatWindowShort(days: number): string {
  return `${days}d`;
}

/// How an asset's rate reads in a picker: "4.18% / yr · 7d", "does not earn",
/// "paused · still fully backed", or "rate cannot be measured".
///
/// The words `rateLabel` gives the Shield picker and the portfolio,
/// flattened to text, so an asset described one way there is not described
/// another way here. A rate carries its measured window; an unmeasurable one is
/// spelled out rather than drawn as the dash, which a native option cannot hide
/// from a screen reader or explain.
export function assetRateTag(asset: RegisteredAsset): string {
  const rate = rateLabel(asset);
  switch (rate.kind) {
    case "rate":
      // `rateLabel` only yields a rate for an asset with `apy`.
      return asset.apy ? `${rate.rate} · ${formatWindowShort(asset.apy.windowDays)}` : rate.rate;
    case "paused":
      return `${RATE_WORDS.paused} · ${RATE_WORDS.backed}`;
    case "unmeasured":
      return RATE_WORDS.unmeasured;
    case "plain":
      return RATE_WORDS.plain;
  }
}
