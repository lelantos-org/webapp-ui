const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_MIN_DISPLAY = 0.005;

/// A USD figure; `<$0.01` for a non-zero amount too small to show.
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs === 0) return USD_FORMATTER.format(0);
  if (abs < USD_MIN_DISPLAY) return value < 0 ? ">-$0.01" : "<$0.01";
  return USD_FORMATTER.format(value);
}

/// A fraction as a two-decimal percentage: `0.0418` becomes `4.18%`.
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`;
}

/// Basis points as a percentage at `fractionDigits` places: 30 bps is `0.30%`.
export function formatBps(bps: bigint | number, fractionDigits: number): string {
  return `${(Number(bps) / 100).toFixed(fractionDigits)}%`;
}
