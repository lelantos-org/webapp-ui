import { useSyncExternalStore } from "react";
import { createSubscribers } from "@/shared/lib/external-store";

/// Events treated as evidence the user is present.
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "focus"] as const;

/// Quiet period before the page counts as unattended.
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
export function onActivity(fn: () => void): () => void {
  return activity.subscribe(fn);
}

let idle = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let stopWatching: (() => void) | undefined;

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
const getIdleOnServer = (): boolean => false;

/// True once the page has gone `IDLE_AFTER_MS` without input.
export function useIsIdle(): boolean {
  return useSyncExternalStore(idleReaders.subscribe, getIdle, getIdleOnServer);
}
