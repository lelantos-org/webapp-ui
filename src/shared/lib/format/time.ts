// Durations and moments, as text.

/// One day in milliseconds.
export const DAY_MS = 24 * 60 * 60 * 1000;

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

/// Compact relative time. Recomputed only when the caller re-renders.
export function relativeTime(from: number, now: number = Date.now()): string {
  const sec = Math.round((from - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return RTF.format(sec, "second");
  if (abs < 3600) return RTF.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(sec / 3600), "hour");
  return RTF.format(Math.round(sec / 86400), "day");
}
