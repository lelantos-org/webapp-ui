// The resync nudge that runs while a balance is settling.

import { pruneExpired } from "@/features/tx";
import { jitter } from "@/shared/query/cadence";

/// How soon to nudge a resync after a watermark-bound entry appears.
///
/// Swap B-notes are flushed asynchronously by the relayer, so observing them
/// requires looking again. Without this the balance follows the wallet's 30s
/// cadence and the "settling" hint appears to stall.
const SETTLING_POLL_MS = 5_000;

/// Ceiling for the backoff below, matching the wallet query's own cadence so
/// the settling poll adds no further requests at that point.
const SETTLING_POLL_MAX_MS = 30_000;

/// One settling poll per page, shared by every `useBalances` caller.
///
/// `useBalances` is called by every balance consumer — `AssetsCard` and
/// whichever form is mounted, at least — and each tick runs a full `syncNotes`
/// on the main thread. A per-caller timer would run the most expensive operation
/// in the app on several overlapping schedules with independent backoffs.
///
/// A closure rather than module-level mutables: the timer, its backoff and its
/// subscriber count form one piece of state with one invariant, that the timer
/// runs exactly while `refs > 0`.
export function createSettlingPoll(prune: () => void = pruneExpired) {
  let refs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = SETTLING_POLL_MS;
  /// The most recently registered invalidator. All are equivalent, closing over
  /// the same query key.
  let invalidate: (() => Promise<void>) | undefined;

  // `delay` is the backoff floor; the timer fires on a jittered draw around it
  // so the settling burst is not exactly periodic. The backoff itself stays
  // exact, since jittering the accumulator would compound.
  const schedule = () => {
    timer = setTimeout(() => {
      prune();
      void invalidate?.();
      delay = Math.min(delay * 2, SETTLING_POLL_MAX_MS);
      schedule();
    }, jitter(delay));
  };

  return {
    /// Join the poll; returns the leave function.
    ///
    /// Backs off rather than holding at 5s: a note is either flushed within a
    /// few seconds or not at all, and an unflushed one would otherwise run a
    /// full `syncNotes` every 5s for the rest of the session. `pruneExpired`
    /// provides the hard stop — once it drops the last watermark entry the
    /// callers unsubscribe and the timer is cleared.
    join(next: () => Promise<void>): () => void {
      invalidate = next;
      refs += 1;
      if (timer === undefined) {
        delay = SETTLING_POLL_MS;
        schedule();
      }
      return () => {
        refs -= 1;
        if (refs > 0) return;
        clearTimeout(timer);
        timer = undefined;
        invalidate = undefined;
      };
    },
  };
}

export const settlingPoll = createSettlingPoll();
