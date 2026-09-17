import { useIsIdle } from "@/shared/lib/idle";

/// Multiplier applied to a poll interval while idle.
export const IDLE_POLL_FACTOR = 4;

const JITTER_FRAC = 0.2;

/// `baseMs` randomised by ±`frac`, so poll cadence is not a device fingerprint. Draw per tick.
export function jitter(baseMs: number, frac = JITTER_FRAC): number {
  return Math.round(baseMs * (1 + (Math.random() * 2 - 1) * frac));
}

/// The interval a poll should use now: `baseMs`, widened while idle, then jittered.
export function pollInterval(baseMs: number, idle: boolean): number {
  return jitter(idle ? baseMs * IDLE_POLL_FACTOR : baseMs);
}

interface PolledQuery {
  state: { dataUpdatedAt: number; errorUpdatedAt: number };
}

/// The `useQuery` options that make a query poll correctly.
export interface PollingOptions {
  refetchInterval: (query: PolledQuery) => number;
  refetchIntervalInBackground: false;
}

const draws = new WeakMap<PolledQuery, { key: string; ms: number }>();

/// One draw per settle: React Query calls `refetchInterval` every render and restarts on a new value.
function stableInterval(query: PolledQuery, baseMs: number, idle: boolean): number {
  const key = `${idle}:${query.state.dataUpdatedAt}:${query.state.errorUpdatedAt}`;
  const last = draws.get(query);
  if (last?.key === key) return last.ms;
  const ms = pollInterval(baseMs, idle);
  draws.set(query, { key, ms });
  return ms;
}

/// Idle-widened, jittered, foreground-only polling options: spread into `useQuery`.
export function usePolling(baseMs: number): PollingOptions {
  const idle = useIsIdle();
  return {
    refetchInterval: (query) => stableInterval(query, baseMs, idle),
    refetchIntervalInBackground: false,
  };
}

/// Cadence shared by the shielded sync and transparent balance reads, so both refresh together.
export const BALANCE_POLL_MS = 30_000;

/// Cadence of the cheap `/v1/head` watermark poll.
export const HEAD_POLL_MS = 5_000;

/// Window in which a remount reuses a cached balance instead of re-reading.
export const BALANCE_STALE_MS = 10_000;

/// Cadence of the governance reads (proposals, votes, tallies, voting power).
export const GOVERNANCE_POLL_MS = 20_000;
