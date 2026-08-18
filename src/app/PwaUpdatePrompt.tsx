import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("pwa");

/// How long a dismissal holds before the prompt is offered again.
const SNOOZE_MS = 30 * 60_000;

/// Offers a reload when a new build is waiting.
///
/// Pairs with `registerType: "prompt"`. The new service worker stays in
/// `waiting` until `updateServiceWorker(true)` runs, so the running page keeps
/// its own precache and its lazy route chunks stay fetchable. Accepting swaps
/// the worker and reloads, which is the only point at which the old caches are
/// cleaned up.
///
/// Deliberately not auto-dismissed: a user mid-transaction should be the one
/// deciding when the page reloads.
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url) {
      log.info("service worker registered", url);
    },
    onRegisterError(err) {
      log.warn("service worker registration failed", err);
    },
  });

  // Dismissing hides the toast for a while rather than for good. `setNeedRefresh(false)`
  // was permanent: nothing re-raised it, so one accidental swipe on mobile left
  // the waiting worker waiting and pinned the user to the old build until every
  // tab was closed.
  const [snoozedAt, setSnoozedAt] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!needRefresh) return;
    if (snoozedAt !== undefined) {
      const id = setTimeout(() => setSnoozedAt(undefined), SNOOZE_MS);
      return () => clearTimeout(id);
    }
    const id = toast("A new version is available.", {
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Reload",
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      onDismiss: () => setSnoozedAt(Date.now()),
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, snoozedAt, updateServiceWorker]);

  return null;
}
