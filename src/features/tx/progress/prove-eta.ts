import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, readJson, writeJson } from "@/shared/lib/storage/safe";

const KEY = LOCAL_KEYS.proveDurations;

/// Samples kept for the median.
export const MAX_SAMPLES = 9;

/// Durations outside this range are noise (a suspended tab, a clock change).
const MIN_MS = 1_000;
const MAX_MS = 10 * 60_000;

function isSamples(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

export function readProveSamples(): number[] {
  return readJson(localStore, KEY, isSamples) ?? [];
}

/// Record one completed proof's duration. Best-effort: storage may be unavailable.
export function recordProveDuration(ms: number): void {
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) return;
  writeJson(localStore, KEY, appendSample(readProveSamples(), ms));
}

/// `samples` with `ms` appended, keeping the newest `MAX_SAMPLES`.
export function appendSample(samples: readonly number[], ms: number): number[] {
  return [...samples, Math.round(ms)].slice(-MAX_SAMPLES);
}

export function median(samples: readonly number[]): number | undefined {
  if (samples.length === 0) return undefined;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/// Time left for the progress card, in 5s steps, or `undefined` with no samples.
export function etaText(samples: readonly number[], elapsedMs: number): string | undefined {
  const typical = median(samples);
  if (typical === undefined) return undefined;
  const left = typical - elapsedMs;
  if (left <= 0) return "taking longer than usual";
  if (left < 5_000) return "a few seconds left";
  const seconds = Math.ceil(left / 5_000) * 5;
  if (seconds < 60) return `about ${seconds} seconds left`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "about a minute left" : `about ${minutes} minutes left`;
}
