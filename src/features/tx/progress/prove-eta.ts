// How long proving usually takes on this device, from the proofs it has built.
//
// "About 20 seconds left" needs a figure, and the only honest one is what this
// browser measured: proving time depends on the machine, the
// circuit and whatever else the tab is doing, and a constant would be a guess
// dressed as a measurement. So each completed proof records its duration, and the
// estimate is the median of the recent ones — the median rather than the mean so
// one proof run in a throttled background tab does not drag every later
// estimate with it.
//
// No samples, no estimate. A deposit has no proof and gets none either: its long
// wait is the relayer's batch, which nothing here can time.

import { LOCAL_KEYS } from "@/shared/lib/storage/keys";
import { localStore, readJson, writeJson } from "@/shared/lib/storage/safe";

const KEY = LOCAL_KEYS.proveDurations;

/// Samples kept. Enough for a stable median, few enough that a new machine or a
/// prover upgrade takes over within a handful of proofs.
export const MAX_SAMPLES = 9;

/// Durations outside this range are measurement noise — a tab suspended mid-proof,
/// a clock change — and are not recorded.
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

/// The time left, as the progress card's sub-line says it, or `undefined` when
/// nothing honest can be said.
///
/// Rounded up to five seconds so the figure does not tick like a countdown it
/// cannot keep. Once the proof has run past its usual time the estimate has
/// failed, and a "0 seconds left" held on screen would be a false claim, so it
/// says it is taking longer instead.
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
