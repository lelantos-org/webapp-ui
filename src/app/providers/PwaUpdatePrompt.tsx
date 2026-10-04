import { useRegisterSW } from "virtual:pwa-register/react";
import { useCallback } from "react";
import { createLogger } from "@/shared/lib/logger";
import { useUpdateOffer } from "./use-update-offer";

const log = createLogger("pwa");

/// Registers the service worker and offers a reload when a new build is waiting.
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

  const reload = useCallback(() => void updateServiceWorker(true), [updateServiceWorker]);
  useUpdateOffer(needRefresh, reload);

  return null;
}
