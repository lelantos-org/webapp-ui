import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const SNOOZE_MS = 30 * 60_000;

/// Offers a reload while `needRefresh`. Never auto-dismissed, and held back while a transaction
/// is being made, where a reload would abandon it.
export function useUpdateOffer(needRefresh: boolean, reload: () => void): void {
  // Dismissing snoozes: clearing `needRefresh` would hide the update until every tab closes.
  const [snoozedAt, setSnoozedAt] = useState<number | undefined>(undefined);
  const transacting = useIsMutating() > 0;

  useEffect(() => {
    if (!needRefresh || transacting) return;
    if (snoozedAt !== undefined) {
      const id = setTimeout(() => setSnoozedAt(undefined), SNOOZE_MS);
      return () => clearTimeout(id);
    }
    const id = toast("A new version is available.", {
      duration: Number.POSITIVE_INFINITY,
      action: { label: "Reload", onClick: reload },
      onDismiss: () => setSnoozedAt(Date.now()),
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, transacting, snoozedAt, reload]);
}
