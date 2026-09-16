import { toast } from "sonner";
import { txExplorerUrl } from "@/config/chains/explorer";
import { reportError } from "@/shared/lib/errors";

export interface TxToastHandle {
  /// Replace the description with an error and mark the toast failed.
  failed(error: unknown): void;
  /// Soft timeout, for unflushed deposits past the tracker deadline.
  timedOut(): void;
}

/// Tx toast that emits only on failure or soft timeout. Success phases are shown
/// inline by the form's `Stepper`.
export function toastTx(
  label: string,
  txHash: string,
  explorerUrl: string | undefined,
): TxToastHandle {
  const url = txExplorerUrl(explorerUrl, txHash);
  const id = `tx:${txHash}`;
  const action = url
    ? {
        label: "view",
        onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
      }
    : undefined;

  return {
    failed(error) {
      const { kind, message } = reportError(`${label} failed`, error);
      if (kind === "rejected") {
        toast.warning(`${label} canceled`, { id, description: message });
      } else {
        toast.error(`${label} failed`, { id, description: message });
      }
    },
    timedOut() {
      toast.warning(`${label} still pending`, {
        id,
        description: "Not flushed yet. Check explorer.",
        ...(action ? { action } : {}),
      });
    },
  };
}
