import { useCallback, useRef } from "react";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("forms:submit");

/// Wrap a form submit handler so it cannot re-enter and cannot leak a rejection.
///
/// Two problems, one guard.
///
/// `handleSubmit` awaits the zod resolver before it reaches the callback, so
/// several microtasks pass between the click and the first render with
/// `isPending: true`. `busy={m.isPending}` is the only thing disabling the
/// button, and it is not true yet for any of them — holding Enter in the amount
/// field (auto-repeat, ~30ms) reliably lands more than one submit. For a deposit
/// that is two on-chain deposits; for a spend it is two proofs racing the same
/// notes, where the loser returns the relayer 409 that `useSpendFailed` reports
/// as a failure on a session whose first tx actually succeeded.
///
/// And `mutateAsync` rejects on failure while react-hook-form's `handleSubmit`
/// rethrows out of its callback. `<form onSubmit>` discards the promise it is
/// handed, and nothing in the app listens for `unhandledrejection`, so every
/// cancelled wallet prompt and every relayer 409 raised one. Cosmetic today,
/// but it would drown a real error reporter the moment one is added.
export function useSubmitOnce<T>(run: (values: T) => Promise<void>): (values: T) => Promise<void> {
  const busy = useRef(false);
  return useCallback(
    async (values: T) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await run(values);
      } catch (e) {
        // The mutation's own `onError` already toasted this and `ActionForm`
        // renders `m.error`; swallowing here only keeps it out of the
        // unhandled-rejection channel.
        log.debug("submit rejected", e);
      } finally {
        busy.current = false;
      }
    },
    [run],
  );
}
