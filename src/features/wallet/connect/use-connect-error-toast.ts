import { useEffect } from "react";
import { CANCELED_IN_WALLET } from "@/shared/lib/errors";
import { toast } from "@/shared/lib/toast";

/// Say why a connect attempt failed: a failed attempt leaves the session disconnected, which no surface reports.
export function useConnectErrorToast(error: string | undefined): void {
  useEffect(() => {
    if (!error) return;
    if (error === CANCELED_IN_WALLET) {
      toast.warning("connection canceled");
      return;
    }
    toast.error("connection failed", { description: error });
  }, [error]);
}
