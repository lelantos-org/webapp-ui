import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("pwa");

const SNOOZE_MS = 30 * 60_000;

/// Offers a reload when a new build is waiting; never auto-dismissed, so a user mid-transaction decides.
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

  // Dismissing snoozes: `setNeedRefresh(false)` would hide the update until every tab closes.
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
