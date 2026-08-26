import { useCallback, useRef } from "react";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("forms:submit");

/// Wrap a form submit handler so it cannot re-enter and cannot leak a rejection.
///
/// `handleSubmit` awaits the zod resolver before reaching the callback, so
/// several microtasks pass between the click and the first render with
/// `isPending: true`. Since `busy={m.isPending}` is the only thing disabling the
/// button, holding Enter in the amount field (auto-repeat, ~30ms) lands more
/// than one submit: two on-chain deposits, or two proofs racing the same notes,
/// where the loser returns the relayer 409 that `useSpendFailed` reports as a
/// failure on a session whose first tx succeeded.
///
/// `mutateAsync` also rejects on failure while react-hook-form's `handleSubmit`
/// rethrows out of its callback. `<form onSubmit>` discards the promise it is
/// handed and nothing listens for `unhandledrejection`, so every cancelled
/// wallet prompt and relayer 409 would raise one.
export function useSubmitOnce<T>(run: (values: T) => Promise<void>): (values: T) => Promise<void> {
  const busy = useRef(false);
  return useCallback(
    async (values: T) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await run(values);
      } catch (e) {
        // The mutation's `onError` has already toasted this and `ActionForm`
        // renders `m.error`, so swallowing here only keeps it out of the
        // unhandled-rejection channel.
        log.debug("submit rejected", e);
      } finally {
        busy.current = false;
      }
    },
    [run],
  );
}
