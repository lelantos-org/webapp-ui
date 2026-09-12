// Dollars, percentages and basis points, as text.

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/// Smallest figure `formatUsd` prints as a number. Below this it renders
/// `<$0.01`, since `$0.00` reads as a measured zero.
const USD_MIN_DISPLAY = 0.005;

/// Render a USD figure. `<$0.01` for a non-zero amount too small to show, and
/// a plain `$0.00` only for an actual zero.
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs === 0) return USD_FORMATTER.format(0);
  if (abs < USD_MIN_DISPLAY) return value < 0 ? ">-$0.01" : "<$0.01";
  return USD_FORMATTER.format(value);
}

/// Render a fraction as a percentage: `0.0418` becomes `4.18%`.
///
/// Two decimals at every size. A rate rounded to `4%` reads as a round number
/// somebody chose, and the difference between 4.18% and 4.49% is the whole point
/// of showing one. Kept here rather than beside either caller because the
/// portfolio table renders two different rates — a venue's and a wallet's — and
/// two copies of this rule would let the columns disagree.
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`;
}

/// Basis points as a percentage: 30 bps at two places is `0.30%`.
///
/// The precision is the caller's, since it is a statement about the setting: a
/// protocol fee is configured to the basis point, while a slippage choice past
/// one percent is not.
export function formatBps(bps: bigint | number, fractionDigits: number): string {
  return `${(Number(bps) / 100).toFixed(fractionDigits)}%`;
}
