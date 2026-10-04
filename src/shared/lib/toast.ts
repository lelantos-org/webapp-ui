import { toast } from "sonner";
import { reportError } from "@/shared/lib/errors";

/// `title` for an op the user called off: "deposit failed" becomes "deposit canceled".
function canceledTitle(title: string): string {
  return title.endsWith(" failed") ? `${title.slice(0, -" failed".length)} canceled` : "Canceled";
}

/// Toasts a failure under `title`; a rejection in the wallet is reported as a cancellation.
export function toastError(title: string, error: unknown): void {
  const { kind, message } = reportError(title, error);
  if (kind === "rejected") {
    toast.warning(canceledTitle(title), { description: message });
    return;
  }
  toast.error(title, { description: message });
}

export function toastInfo(message: string): void {
  toast.info(message);
}

export { toast };
