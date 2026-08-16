import { InsufficientCoverError, WalletError } from "@lelantos-org/sdk/errors";

/// Map a thrown value to a short, user-facing string.
export function describeError(e: unknown): string {
  if (e instanceof WalletError) return describeWalletError(e);
  if (e instanceof Error) return e.message;
  return String(e);
}

export type ErrorKind = "rejected" | "failed";

/// User-facing one-liner for an error. Never returns a raw stack trace or
/// hex selector.
export function friendlyMessage(e: unknown): string {
  const c = classifyError(e);
  if (c.kind === "rejected") return "Canceled in wallet.";
  const raw = c.raw;
  const lower = raw.toLowerCase();
  if (lower.includes("insufficient cover") || lower.includes("insufficient balance")) {
    return "Insufficient balance for this amount.";
  }
  if (lower.includes("slippage") || lower.includes("min out") || lower.includes("minout")) {
    return "Price moved past your slippage limit. Refresh quote and retry.";
  }
  if (lower.includes("expired") || lower.includes("deadline")) {
    return "Quote expired. Refresh and retry.";
  }
  if (lower.includes("nonce too low") || lower.includes("replacement transaction")) {
    return "Wallet nonce conflict. Reset pending txs and retry.";
  }
  if (lower.includes("allowance") || lower.includes("permit")) {
    return "Token approval missing or expired. Re-run setup.";
  }
  if (lower.includes("network") && (lower.includes("changed") || lower.includes("disconnect"))) {
    return "Network changed mid-flight. Reconnect wallet and retry.";
  }
  if (lower.includes("relayer")) {
    return "Relayer rejected the request. Retry shortly.";
  }
  if (lower.includes("prover") || lower.includes("proof")) {
    return "Proof generation failed. Reload to reset the prover.";
  }
  if (lower.includes("execution reverted") || lower.includes("revert")) {
    return "Transaction reverted on-chain. Check balance and slippage, then retry.";
  }
  if (raw && raw.length < 140 && !raw.includes("0x") && !raw.includes("\n")) {
    return raw;
  }
  return "Something went wrong. Please try again.";
}

/// Classify an error as a user-cancellation (wallet popup rejected) vs any
/// other failure.
export function classifyError(e: unknown): { kind: ErrorKind; raw: string } {
  const raw = describeError(e);
  if (e instanceof WalletError && e.code === "PERMIT_REJECTED") {
    return { kind: "rejected", raw };
  }
  // EIP-1193 user-rejection codes / common wallet messages.
  const obj = e as { code?: number | string; reason?: string } | null;
  if (obj && (obj.code === 4001 || obj.code === "ACTION_REJECTED")) {
    return { kind: "rejected", raw };
  }
  const lower = raw.toLowerCase();
  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected by user") ||
    lower.includes("rejected the request") ||
    lower.includes("user cancelled") ||
    lower.includes("user canceled")
  ) {
    return { kind: "rejected", raw };
  }
  return { kind: "failed", raw };
}

function describeWalletError(e: WalletError): string {
  switch (e.code) {
    case "INSUFFICIENT_COVER": {
      const c = e instanceof InsufficientCoverError ? e : undefined;
      const head = `Insufficient cover${c ? ` for ${c.target}` : ""}.`;
      const n = c?.consolidate.length ?? 0;
      const tip =
        n > 0
          ? `Consolidate ${n} smallest note${n === 1 ? "" : "s"} first, or pass autoConsolidate.`
          : "Top up the asset balance.";
      return `${head} ${tip}`;
    }
    case "WALLET_CONFIG":
      return `Wallet misconfigured: ${e.message}`;
    case "RELAYER_TIMEOUT":
      return "Relayer timed out. Retry shortly.";
    case "RELAYER_FAILED":
      return "Relayer rejected the request. Check the relayer logs or your network.";
    case "FMD_TIMEOUT":
      return "Note discovery (FMD) timed out. Retry shortly.";
    case "FMD_FAILED":
      return "Note discovery (FMD) request failed.";
    case "PROVER_FAILED":
      return "Proof generation failed. Reload to reset the prover and retry.";
    case "PROVER_ARTIFACTS_MISSING":
      return "Prover artifacts missing. Reload to refetch and retry.";
    case "PROVER_ARTIFACTS_FAILED":
      return "Prover artifacts failed to load. Check your connection and reload.";
    case "WORKER_TIMEOUT":
      return "A background worker timed out. Reload and retry.";
    case "WORKER_CRASHED":
    case "WORKER_FAILED":
      return "A background worker failed. Reload to restart it and retry.";
    case "WIRE_FORMAT":
      return "Unexpected response from the server. Retry shortly.";
    case "ENVIRONMENT":
      return `Unsupported browser environment: ${e.message}`;
    case "X402_PAYMENT":
      return "Payment required by the service was refused.";
    case "NETWORK_NOT_DEPLOYED":
      return `Network not deployed: ${e.message}`;
    case "PERMIT_REJECTED":
      return "Signature rejected in wallet.";
    case "DEPOSIT_ADAPTER":
      return `Wallet adapter cannot satisfy this deposit: ${e.message}`;
    case "TX_MINING":
      return "Transaction did not mine. Retry or check the explorer.";
    // `SELECTION` / `INVALID_ARGUMENT` already carry a user-readable message.
    // The SDK documents its code list as open, so unknown codes land here too.
    default:
      return e.message;
  }
}
