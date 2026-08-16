import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("pwa");

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
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url) {
      log.info("service worker registered", url);
    },
    onRegisterError(err) {
      log.warn("service worker registration failed", err);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    const id = toast("A new version is available.", {
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Reload",
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
      onDismiss: () => setNeedRefresh(false),
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}
