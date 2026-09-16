// What Home says about one asset beyond its balance: what the notes held have
// earned, and the empty state's line. Pure, so each rule is a test rather than
// a comment.
//
// The venue's rate is not here: `rate-label.ts` states it for the Shield picker
// and Home alike, so the two surfaces cannot word the rate rules differently.

import type { RegisteredAsset } from "@/config/chains";
import { baseUnitsUsd } from "@/shared/domain/units";
import { DISPLAY_FRAC_DIGITS } from "@/shared/lib/format/asset";
import { formatPercent, formatUsd } from "@/shared/lib/format/money";
import { formatDecimalCompact } from "@/shared/lib/format/number";
import { growthOf, type YieldGain } from "../yield/yield-gains";

/// Colour of an earned figure: accent when it grew, warn when the venue lost or
/// was paused. Warn, not err — neither is a fault with the user's funds.
export type EarnedTone = "up" | "down" | "paused";

export interface EarnedLine {
  text: string;
  tone: EarnedTone;
}

/// The sign an earned figure leads with: `−` or `+`, after a `≥` when some notes
/// were left out of the sum.
export function signOf(partial: boolean, down: boolean): string {
  return `${partial ? "≥" : ""}${down ? "−" : "+"}`;
}

/// The asset row's second right-hand line: "+$12.40 earned".
///
/// `undefined` — no line — for plain custody, and for an earning asset whose
/// basis did not resolve: the row detail explains that case, and a dash on the
/// list would sit where every other row states a figure.
///
/// Dollars when the asset is priced, since the hero sums the same figures and
/// the list should add up to it. Unpriced, the token amount with its symbol,
/// which is still true and still comparable within the row. `≥` when some notes
/// were left out of the sum.
export function earnedLine(
  gain: YieldGain | undefined,
  meta: Pick<RegisteredAsset, "yieldEnabled" | "yieldHalted" | "decimals" | "symbol">,
  priceUsd: number | undefined,
): EarnedLine | undefined {
  if (!meta.yieldEnabled || gain === undefined || gain.resolvedNotes === 0) return undefined;
  const down = gain.gain < 0n;
  const sign = signOf(gain.unknownNotes > 0, down);
  const abs = down ? -gain.gain : gain.gain;
  const figure =
    priceUsd === undefined
      ? `${formatDecimalCompact(abs, meta.decimals, DISPLAY_FRAC_DIGITS)} ${meta.symbol}`
      : formatUsd(baseUnitsUsd(abs, meta.decimals, priceUsd));
  return {
    text: `${sign}${figure} earned`,
    tone: meta.yieldHalted ? "paused" : down ? "down" : "up",
  };
}

/// The row detail's "You've earned": token units and the growth percentage.
export interface EarnedDetail {
  /// "+12.40", "≥+12.40", "−0.1"; `undefined` when no basis resolved.
  amount: string | undefined;
  /// "+0.15%", "-10.00%".
  percent: string | undefined;
  partial: boolean;
  down: boolean;
}

export function earnedDetail(gain: YieldGain | undefined, decimals: number): EarnedDetail {
  if (gain === undefined || gain.resolvedNotes === 0) {
    return { amount: undefined, percent: undefined, partial: false, down: false };
  }
  const down = gain.gain < 0n;
  const partial = gain.unknownNotes > 0;
  const abs = down ? -gain.gain : gain.gain;
  const growth = growthOf(gain);
  return {
    amount: `${signOf(partial, down)}${formatDecimalCompact(abs, decimals, DISPLAY_FRAC_DIGITS)}`,
    percent: `${growth >= 0 ? "+" : ""}${formatPercent(growth)}`,
    partial,
    down,
  };
}

const COUNT_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

/// The empty state's line under "Nothing shielded yet": "These five assets are
/// supported on Base right now." Counts in words up to ten, and in digits past
/// that.
export function supportedLine(count: number, chainName: string): string {
  if (count === 0) return `No assets are supported on ${chainName} yet.`;
  if (count === 1) return `This asset is supported on ${chainName} right now.`;
  const n = COUNT_WORDS[count] ?? String(count);
  return `These ${n} assets are supported on ${chainName} right now.`;
}
