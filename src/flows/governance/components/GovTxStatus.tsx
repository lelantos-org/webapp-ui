import type { ReactNode } from "react";
import { useTxExplorerUrl } from "@/features/chain";
import { governorErrorCode } from "@/features/governance";
import { reportError } from "@/shared/lib/errors";
import { TxFailedCard } from "@/shared/ui/tx-cards/TxFailedCard";
import { TxProgressCard } from "@/shared/ui/tx-cards/TxProgressCard";
import { TxSettledCard } from "@/shared/ui/tx-cards/TxSettledCard";
import { governanceErrorText } from "../governance-copy";

export interface GovTxStatusProps {
  status: "idle" | "pending" | "success" | "error";
  error: unknown;
  /// Set once the wallet has broadcast.
  hash: string | undefined;
  /// "Casting your vote", "Voted For".
  pendingTitle: string;
  doneTitle: string;
  failedTitle: string;
  /// A control under the settled card, such as "Done".
  doneAction?: ReactNode;
  onRetry?: (() => void) | undefined;
}

/// The line to show for a failed governance write: the governor's own reason
/// where it gave one, otherwise the wallet's or the network's, logged.
function txErrorMessage(e: unknown): string {
  return (
    governanceErrorText(governorErrorCode(e)) ?? reportError("governance tx failed", e).message
  );
}

/// A write's progress as the panels that start one hand it down.
export type GovTxState = Pick<GovTxStatusProps, "status" | "error" | "hash"> & { reset(): void };

const STEPS = [
  {
    id: "sign",
    label: "Approve in your wallet",
    activeLabel: "Waiting for your wallet",
    doneLabel: "Approved in your wallet",
  },
  {
    id: "confirm",
    label: "Confirm on-chain",
    activeLabel: "Waiting for the block",
    doneLabel: "Confirmed on-chain",
  },
] as const;

/// A governance write's progress, result or failure, on the shared tx cards.
/// Renders nothing while idle.
export function GovTxStatus({
  status,
  error,
  hash,
  pendingTitle,
  doneTitle,
  failedTitle,
  doneAction,
  onRetry,
}: GovTxStatusProps) {
  const explorer = useTxExplorerUrl();
  if (status === "pending") {
    return (
      <TxProgressCard title={pendingTitle} steps={STEPS} current={hash ? "confirm" : "sign"} />
    );
  }
  if (status === "success") {
    return (
      <TxSettledCard
        title={doneTitle}
        hash={hash}
        explorerUrl={hash ? explorer(hash) : undefined}
        action={doneAction}
      />
    );
  }
  if (status === "error") {
    return (
      <TxFailedCard
        title={failedTitle}
        message={txErrorMessage(error)}
        reassurance={hash ? undefined : "Nothing was sent."}
        hash={hash}
        explorerUrl={hash ? explorer(hash) : undefined}
        onRetry={onRetry}
      />
    );
  }
  return null;
}
