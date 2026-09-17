import { pruneExpired } from "@/features/tx";
import { jitter } from "@/shared/query/cadence";

const SETTLING_POLL_MS = 5_000;

const SETTLING_POLL_MAX_MS = 30_000;

/// One shared resync poll, backing off, whose timer runs exactly while someone has joined.
export function createSettlingPoll(prune: () => void = pruneExpired) {
  let refs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = SETTLING_POLL_MS;
  let invalidate: (() => Promise<void>) | undefined;

  // Jitter each draw, not `delay`: jittering the accumulator would compound.
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
