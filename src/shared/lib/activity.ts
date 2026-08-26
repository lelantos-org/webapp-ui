// Single source for "is the user present", shared by consumers on different
// timescales: the ambient backdrop parks its animation after seconds without
// input, the polling queries lengthen their interval after minutes of it.
//
// DOM listeners are attached on the first subscriber and detached after the
// last, so nothing is bound in a test or in a tree that does not subscribe.
//
// Complements `refetchIntervalInBackground: false`, which covers only a hidden
// tab. This covers a visible tab receiving no input.

import { useSyncExternalStore } from "react";

/** Events treated as evidence the user is present. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "focus"] as const;

/**
 * Quiet period before the page counts as unattended.
 *
 * Long enough that reading a balance without interacting does not trip it. The
 * backdrop applies its own, shorter budget, since resuming an animation is
 * cheaper than resuming a data poll.
 */
const IDLE_AFTER_MS = 2 * 60_000;

/** Multiplier applied to a poll interval while idle. */
export const IDLE_POLL_FACTOR = 4;

/**
 * Fraction by which `jitter` may shorten or lengthen an interval.
 *
 * Kept small: the goal is to blur a cadence, not to defer work.
 * `selection.ts` applies a spend cooldown keyed on `firstSeenBlock`, and a
 * staler nullifier view raises the odds of building a spend against a note
 * already spent elsewhere. ±20% costs at most six seconds on the 30s polls,
 * leaving that margin intact.
 */
const JITTER_FRAC = 0.2;

/**
 * `baseMs` perturbed by up to ±`frac`.
 *
 * Polls are otherwise exactly periodic (30s sync, 30s balances, 15s health),
 * which gives a passive observer such as the edge or an ISP a device
 * fingerprint and a way to segment one long-lived connection into sessions.
 * The app never sees a client IP, but the components in front of it do, and
 * cadence is what lets them join requests carrying no identifier.
 *
 * Call this per tick, not once per mount. React Query accepts a function for
 * `refetchInterval` and re-invokes it after each fetch; a value fixed at mount
 * becomes a constant offset, which is itself a stable per-session fingerprint.
 */
export function jitter(baseMs: number, frac = JITTER_FRAC): number {
  return Math.round(baseMs * (1 + (Math.random() * 2 - 1) * frac));
}

/**
 * The interval a poll should use right now: `baseMs`, widened while idle, then
 * jittered.
 *
 * Both adjustments are applied in one call so neither can be used without the
 * other. Omitting the idle factor keeps an unattended tab polling at full rate,
 * which for `transparent-balances` means announcing the user's EOA to a
 * third-party RPC every 30s indefinitely.
 *
 * Pass it as a thunk — `refetchInterval: () => pollInterval(POLL_MS, idle)` —
 * so React Query re-draws the jitter after each fetch.
 */
export function pollInterval(baseMs: number, idle: boolean): number {
  return jitter(idle ? baseMs * IDLE_POLL_FACTOR : baseMs);
}

/** The `useQuery` options that make a query poll correctly. */
export interface PollingOptions {
  refetchInterval: () => number;
  refetchIntervalInBackground: false;
}

/**
 * Every option a polled query needs, bundled so none can be left out.
 *
 * `pollInterval` binds the idle factor to the jitter, but three things deliver
 * them and each fails silently if omitted: the `useIsIdle()` subscription, the
 * thunk (a bare value freezes the jitter into a fixed per-session offset), and
 * `refetchIntervalInBackground: false` (without it a hidden tab keeps polling).
 *
 * Usage: `...usePolling(BALANCE_POLL_MS)` inside the `useQuery` options.
 */
export function usePolling(baseMs: number): PollingOptions {
  const idle = useIsIdle();
  return {
    refetchInterval: () => pollInterval(baseMs, idle),
    refetchIntervalInBackground: false,
  };
}

/**
 * Cadence for the two queries that answer what a wallet holds: the shielded note
 * sync and the transparent chain reads.
 *
 * One constant rather than one per query. The two are read side by side — a
 * deposit form validates against the transparent balance while the portfolio
 * shows the shielded one — so any drift between them appears as two figures
 * refreshing at visibly different times.
 */
export const BALANCE_POLL_MS = 30_000;

/**
 * Cadence of the `/v1/head` watermark poll.
 *
 * Six times the rate of `BALANCE_POLL_MS` at a fraction of the cost: the
 * endpoint is two indexed `MAX()`s and a few bytes, where a balance refresh is a
 * full `syncNotes` plus a recompute over every unspent note. New value is
 * detected within about five seconds while the expensive work runs only when
 * something moved.
 *
 * Goes through `pollInterval` like every other poll here, so the jitter and
 * idle-widening apply unchanged.
 */
export const HEAD_POLL_MS = 5_000;

/**
 * Window in which a remount reuses a cached balance instead of re-reading.
 *
 * Well under `BALANCE_POLL_MS`, so the polling cadence is unaffected. The forms
 * are routes, so navigating between deposit and withdraw remounts their queries
 * repeatedly; every balance-changing op invalidates explicitly, so the window
 * cannot mask a figure the user has just changed.
 */
export const BALANCE_STALE_MS = 10_000;

const subscribers = new Set<() => void>();

function notifyActivity(): void {
  for (const fn of subscribers) fn();
}

/**
 * Call `fn` on every input event until the returned function is invoked.
 *
 * Exposes the raw signal rather than derived state; consumers needing a quiet
 * period build it from this, as `useIsIdle` does below.
 */
export function onActivity(fn: () => void): () => void {
  if (subscribers.size === 0 && typeof window !== "undefined") {
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, notifyActivity, { passive: true });
    }
  }
  subscribers.add(fn);

  return () => {
    subscribers.delete(fn);
    if (subscribers.size > 0 || typeof window === "undefined") return;
    for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, notifyActivity);
  };
}

let idle = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let stopWatching: (() => void) | undefined;
const idleListeners = new Set<() => void>();

function setIdle(next: boolean): void {
  if (idle === next) return;
  idle = next;
  for (const fn of idleListeners) fn();
}

function restartIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => setIdle(true), IDLE_AFTER_MS);
}

function subscribeIdle(fn: () => void): () => void {
  if (idleListeners.size === 0) {
    stopWatching = onActivity(() => {
      setIdle(false);
      restartIdleTimer();
    });
    restartIdleTimer();
  }
  idleListeners.add(fn);

  return () => {
    idleListeners.delete(fn);
    if (idleListeners.size > 0) return;
    stopWatching?.();
    stopWatching = undefined;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
    // With nothing subscribed the flag is no longer maintained, so reset it.
    idle = false;
  };
}

const getIdle = (): boolean => idle;
/** Not idle before hydration: no input has been observable yet. */
const getIdleOnServer = (): boolean => false;

/**
 * True once the page has gone `IDLE_AFTER_MS` without input.
 *
 * Reactive: a query reading this recomputes `refetchInterval` when it flips, so
 * returning to the tab restores the shorter interval immediately rather than at
 * the end of the current interval.
 */
export function useIsIdle(): boolean {
  return useSyncExternalStore(subscribeIdle, getIdle, getIdleOnServer);
}
