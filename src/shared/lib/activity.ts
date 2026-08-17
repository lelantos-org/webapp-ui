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
 * backdrop applies its own, shorter budget: resuming an animation is cheap,
 * resuming a data poll is not.
 */
const IDLE_AFTER_MS = 2 * 60_000;

/** Multiplier applied to a poll interval while idle. */
export const IDLE_POLL_FACTOR = 4;

const subscribers = new Set<() => void>();

function notifyActivity(): void {
  for (const fn of subscribers) fn();
}

/**
 * Call `fn` on every input event until the returned function is invoked.
 *
 * Exposes the raw signal rather than derived state; consumers needing "quiet
 * for N ms" build it from this, as `useIsIdle` does below.
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
    // Reset: with nothing subscribed the flag is not maintained.
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
 * the end of the current one.
 */
export function useIsIdle(): boolean {
  return useSyncExternalStore(subscribeIdle, getIdle, getIdleOnServer);
}
