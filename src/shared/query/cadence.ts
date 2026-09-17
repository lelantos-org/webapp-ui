// How often queries refetch, and how long a cached answer stands.
//
// Every poll goes through `usePolling`, which widens the interval while the page
// is unattended (`shared/lib/idle`) and jitters it per tick. Cadences read side
// by side live here as named constants, so two figures on one screen cannot
// refresh on visibly different schedules.

import { useIsIdle } from "@/shared/lib/idle";

/// Multiplier applied to a poll interval while idle.
export const IDLE_POLL_FACTOR = 4;

/// Fraction by which `jitter` may shorten or lengthen an interval.
///
/// Kept small: the goal is to blur a cadence, not to defer work. The SDK's
/// `wallet/selection.ts` applies a spend cooldown keyed on `firstSeenBlock`, and a staler nullifier
/// view raises the odds of building a spend against a note already spent
/// elsewhere. ±20% costs at most six seconds on the 30s polls.
const JITTER_FRAC = 0.2;

/// `baseMs` perturbed by up to ±`frac`.
///
/// Polls are otherwise exactly periodic (30s sync, 30s balances, 15s health),
/// giving a passive observer such as the edge or an ISP a device fingerprint and
/// a way to segment one long-lived connection into sessions. The app never sees a
/// client IP, but the components in front of it do, and cadence is what lets them
/// join requests carrying no identifier.
///
/// Call this per tick, not once per mount: a value fixed at mount becomes a
/// constant offset, itself a stable per-session fingerprint.
export function jitter(baseMs: number, frac = JITTER_FRAC): number {
  return Math.round(baseMs * (1 + (Math.random() * 2 - 1) * frac));
}

/// The interval a poll should use now: `baseMs`, widened while idle, then
/// jittered.
///
/// Both adjustments are applied in one call so neither can be used without the
/// other. Omitting the idle factor keeps an unattended tab polling at full rate,
/// which for `transparent-balances` announces the user's EOA to a third-party RPC
/// every 30s indefinitely.
///
/// Not passed to React Query directly: `usePolling` wraps it so the draw holds
/// until the next fetch settles.
export function pollInterval(baseMs: number, idle: boolean): number {
  return jitter(idle ? baseMs * IDLE_POLL_FACTOR : baseMs);
}

/// What `refetchInterval` is handed: the query, of which only its last-settled
/// times are read.
interface PolledQuery {
  state: { dataUpdatedAt: number; errorUpdatedAt: number };
}

/// The `useQuery` options that make a query poll correctly.
export interface PollingOptions {
  refetchInterval: (query: PolledQuery) => number;
  refetchIntervalInBackground: false;
}

/// The interval last drawn for each query, and what it was drawn for.
const draws = new WeakMap<PolledQuery, { key: string; ms: number }>();

/// One jittered interval per settled fetch of `query`, re-drawn only when the
/// query settles again or the idle state flips.
///
/// React Query re-invokes `refetchInterval` on every render of an observing
/// component, not only after a fetch, and restarts its timer whenever the value
/// differs from the last one. A fresh draw per call therefore restarts the poll
/// on every render: a screen re-rendering faster than its interval — a
/// countdown ticking each second — never polls at all. Keying the draw on the
/// query's last settle keeps it stable across renders while still re-jittering
/// every tick. Keyed per query rather than per hook call, since one
/// `usePolling` result is often spread into two queries.
function stableInterval(query: PolledQuery, baseMs: number, idle: boolean): number {
  const key = `${idle}:${query.state.dataUpdatedAt}:${query.state.errorUpdatedAt}`;
  const last = draws.get(query);
  if (last?.key === key) return last.ms;
  const ms = pollInterval(baseMs, idle);
  draws.set(query, { key, ms });
  return ms;
}

/// Every option a polled query needs, bundled so none can be left out.
///
/// `pollInterval` binds the idle factor to the jitter, but three things deliver
/// them and each fails silently if omitted: the `useIsIdle()` subscription, the
/// per-fetch draw (a bare value freezes the jitter into a fixed per-session
/// offset; a draw per call restarts the timer on every render), and
/// `refetchIntervalInBackground: false` (without it a hidden tab keeps polling).
///
/// Usage: `...usePolling(BALANCE_POLL_MS)` inside the `useQuery` options.
export function usePolling(baseMs: number): PollingOptions {
  const idle = useIsIdle();
  return {
    refetchInterval: (query) => stableInterval(query, baseMs, idle),
    refetchIntervalInBackground: false,
  };
}

/// Cadence for the two queries that answer what a wallet holds: the shielded note
/// sync and the transparent chain reads.
///
/// One constant rather than one per query. The two are read side by side — a
/// deposit form validates against the transparent balance while the portfolio
/// shows the shielded one — so any drift between them appears as two figures
/// refreshing at visibly different times.
export const BALANCE_POLL_MS = 30_000;

/// Cadence of the `/v1/head` watermark poll.
///
/// Six times the rate of `BALANCE_POLL_MS` at a fraction of the cost: the
/// endpoint is two indexed `MAX()`s and a few bytes, where a balance refresh is a
/// full notes sync plus a recompute over every unspent note. New value shows
/// within about five seconds while the expensive work runs only when something
/// moved.
///
/// Goes through `pollInterval` like every other poll here, so the jitter and
/// idle-widening apply unchanged.
export const HEAD_POLL_MS = 5_000;

/// Window in which a remount reuses a cached balance instead of re-reading.
///
/// Well under `BALANCE_POLL_MS`, so the polling cadence is unaffected. The forms
/// are routes, so navigating between deposit and withdraw remounts their queries
/// repeatedly; every balance-changing op invalidates explicitly, so the window
/// cannot mask a figure the user has just changed.
export const BALANCE_STALE_MS = 10_000;

/// Cadence of the governance reads: the indexed proposal list and votes, and the
/// on-chain state, tallies and voting power beside them.
///
/// Slower than a balance, since nothing here changes because of what this wallet
/// holds, and faster than a proposal's shortest phase on a dev chain (a
/// five-minute voting period), so a state change shows within one poll. Every
/// write this app sends invalidates explicitly, so the user's own vote never
/// waits on it.
export const GOVERNANCE_POLL_MS = 20_000;
