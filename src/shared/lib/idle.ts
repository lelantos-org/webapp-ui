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
import { createSubscribers } from "@/shared/lib/external-store";

/// Events treated as evidence the user is present.
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "focus"] as const;

/// Quiet period before the page counts as unattended.
///
/// Long enough that reading a balance without interacting does not trip it. The
/// backdrop applies its own, shorter budget, since resuming an animation is
/// cheaper than resuming a data poll.
const IDLE_AFTER_MS = 2 * 60_000;

const activity = createSubscribers({
  onFirst() {
    if (typeof window === "undefined") return;
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, notifyActivity, { passive: true });
    }
  },
  onLast() {
    if (typeof window === "undefined") return;
    for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, notifyActivity);
  },
});

function notifyActivity(): void {
  activity.notify();
}

/// Call `fn` on every input event until the returned function is invoked.
///
/// Exposes the raw signal rather than derived state; consumers needing a quiet
/// period build it from this, as `useIsIdle` does below.
export function onActivity(fn: () => void): () => void {
  return activity.subscribe(fn);
}

let idle = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let stopWatching: (() => void) | undefined;

/// The idle flag is maintained only while something reads it: the first reader
/// starts watching for input, the last one stops it.
const idleReaders = createSubscribers({
  onFirst() {
    stopWatching = onActivity(() => {
      setIdle(false);
      restartIdleTimer();
    });
    restartIdleTimer();
  },
  onLast() {
    stopWatching?.();
    stopWatching = undefined;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
    // With nothing subscribed the flag is no longer maintained, so reset it.
    idle = false;
  },
});

function setIdle(next: boolean): void {
  if (idle === next) return;
  idle = next;
  idleReaders.notify();
}

function restartIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => setIdle(true), IDLE_AFTER_MS);
}

const getIdle = (): boolean => idle;
/// Not idle before hydration: no input has been observable yet.
const getIdleOnServer = (): boolean => false;

/// True once the page has gone `IDLE_AFTER_MS` without input.
///
/// Reactive: a query reading this recomputes `refetchInterval` when it flips, so
/// returning to the tab restores the shorter interval immediately rather than at
/// the end of the current interval.
export function useIsIdle(): boolean {
  return useSyncExternalStore(idleReaders.subscribe, getIdle, getIdleOnServer);
}
