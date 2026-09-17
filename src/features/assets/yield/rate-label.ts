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

/// Words a rate label uses, shared so every surface words a state the same way.
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

/// The measured window, short (`7d`). Always the registry's window, never a literal.
export function formatWindowShort(days: number): string {
  return `${days}d`;
}

/// An asset's rate as plain text for a native `<option>`, worded as `rateLabel` words it.
export function assetRateTag(asset: RegisteredAsset): string {
  const rate = rateLabel(asset);
  switch (rate.kind) {
    case "rate":
      return asset.apy ? `${rate.rate} · ${formatWindowShort(asset.apy.windowDays)}` : rate.rate;
    case "paused":
      return `${RATE_WORDS.paused} · ${RATE_WORDS.backed}`;
    case "unmeasured":
      return RATE_WORDS.unmeasured;
    case "plain":
      return RATE_WORDS.plain;
  }
}
