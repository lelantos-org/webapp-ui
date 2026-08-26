import { toast } from "sonner";
import { reportError } from "@/shared/lib/report-error";

/// Pure: the explorer base is per-chain, so it is passed in rather than read from
/// a module global. `undefined` when the chain has no explorer configured, which
/// callers render as plain text instead of a link.
export function txExplorerUrl(explorerUrl: string | undefined, txHash: string): string | undefined {
  if (!explorerUrl) return undefined;
  return `${explorerUrl.replace(/\/$/, "")}/tx/${txHash}`;
}

export interface TxToastHandle {
  /// Phase 2: receipt mined.
  mined(blockNumber: number): void;
  /// Phase 3: the relayer's `flushBatch` landed. Deposits only.
  flushed(blockNumber: number): void;
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
    mined() {
      // The inline stepper already shows "on-chain", so no toast is emitted.
    },
    flushed() {
      // The inline stepper already shows "flushed", so no toast is emitted.
    },
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

export function toastError(prefix: string, error: unknown): void {
  const { kind, message } = reportError(prefix, error);
  if (kind === "rejected") {
    toast.warning(`${prefix} canceled`, { description: message });
    return;
  }
  toast.error(prefix, { description: message });
}

export function toastInfo(message: string): void {
  toast.info(message);
}

export { toast };
