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
/// its precache and its lazy route chunks stay fetchable. Accepting swaps the
/// worker and reloads, which is the only point at which stale caches are
/// cleaned up.
///
/// Never auto-dismissed: a user mid-transaction decides when the page reloads.
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

  // Dismissing snoozes the toast rather than clearing it. `setNeedRefresh(false)`
  // is permanent and nothing re-raises it, so an accidental swipe would pin the
  // user to the current build until every tab was closed.
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
