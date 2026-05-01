import { toast } from "sonner";
import { env } from "@/config/env";
import { classifyError, friendlyMessage } from "@/shared/lib/errors";

export function txExplorerUrl(txHash: string): string | undefined {
  if (!env.explorerUrl) return undefined;
  const base = env.explorerUrl.replace(/\/$/, "");
  return `${base}/tx/${txHash}`;
}

export interface TxToastHandle {
  /// Phase 2 — receipt mined.
  mined(blockNumber: number): void;
  /// Phase 3 — relayer flushBatch landed (deposits only).
  flushed(blockNumber: number): void;
  /// Replace description with error and mark toast failed.
  failed(error: unknown): void;
  /// Soft timeout — for unflushed deposits past the tracker deadline.
  timedOut(): void;
}

/// Tx toast that emits only on failure or soft timeout; success phases are
/// shown inline by the form's `Stepper`.
export function toastTx(label: string, txHash: string): TxToastHandle {
  const url = txExplorerUrl(txHash);
  const id = `tx:${txHash}`;
  const action = url
    ? {
        label: "view",
        onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
      }
    : undefined;

  return {
    mined() {
      // Inline stepper already shows "on-chain"; no toast.
    },
    flushed() {
      // Inline stepper already shows "flushed"; no toast.
    },
    failed(error) {
      const c = classifyError(error);
      if (c.kind === "rejected") {
        toast.warning(`${label} canceled`, { id, description: "Canceled in wallet." });
      } else {
        toast.error(`${label} failed`, { id, description: friendlyMessage(error) });
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
  const c = classifyError(error);
  if (c.kind === "rejected") {
    toast.warning(`${prefix} canceled`, { description: "Canceled in wallet." });
  } else {
    toast.error(prefix, { description: friendlyMessage(error) });
  }
}

export function toastInfo(message: string): void {
  toast.info(message);
}

export { toast };
