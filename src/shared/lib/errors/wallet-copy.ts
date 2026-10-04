import {
  type AnyWalletError,
  isWalletError,
  type WalletErrorCode,
  type WalletErrorOf,
} from "@lelantos-org/sdk";

type RelayerRejected = WalletErrorOf<"RELAYER_REJECTED">;

/// A spend the relayer refused because a nullifier is already spent or in flight; callers resync.
export function isDuplicateSpend(e: unknown): e is RelayerRejected {
  return (
    isWalletError(e, "RELAYER_REJECTED") &&
    (e.reason === "nullifier-spent" || e.reason === "nullifier-in-flight")
  );
}

const FEE_MOVED =
  "The relayer's fee changed while this was being prepared. Nothing was sent; try again.";

/// The refusals over the relayer's fee: the quote on screen is out of date.
const FEE_MOVED_REASONS: ReadonlySet<RelayerRejected["reason"]> = new Set([
  "stale-estimate",
  "fee-missing",
  "fee-too-low",
]);

const NOTHING_MOVED =
  "On a swap the price may have passed your slippage limit; otherwise your balance may have changed.";

/// One line per other reason the relayer gives. `unknown` has none: it falls back on `retryable`.
const RELAYER_REJECTION: Partial<Record<RelayerRejected["reason"], string>> = {
  "nullifier-in-flight":
    "Another send using the same funds is still being processed. Wait for it to finish, then retry.",
  "nullifier-spent":
    "These funds were already spent. Your balance is being refreshed — check it before retrying.",
  "idempotency-key-reused": "This was already submitted. Check your balance before sending again.",
  "fee-asset-rejected":
    "The relayer no longer takes that token for its fee. Pay it in another token.",
  "contract-rejected": `The pool refused this, so nothing moved. ${NOTHING_MOVED}`,
  reverted: `It reverted, so nothing moved. ${NOTHING_MOVED}`,
  "bad-request": "The relayer could not read this request. Reload the page and try again.",
  "unknown-chain": "The relayer does not serve this network.",
  unavailable: "The relayer is unavailable right now. Try again shortly.",
  internal: "The relayer hit an error. Try again shortly.",
};

function describeRelayerRejected(e: RelayerRejected): string {
  if (FEE_MOVED_REASONS.has(e.reason)) return FEE_MOVED;
  return (
    RELAYER_REJECTION[e.reason] ??
    (e.retryable
      ? "The relayer refused this. Try again shortly."
      : "The relayer refused this, and trying again will not help. Nothing was sent.")
  );
}

export function isFeeMoved(e: unknown): boolean {
  return isWalletError(e, "RELAYER_REJECTED") && FEE_MOVED_REASONS.has(e.reason);
}

/// A failure of the prover or its worker, which a fresh worker may not repeat.
export function isProverFault(e: unknown): boolean {
  return PROVER_FAULTS.some((code) => isWalletError(e, code));
}

const PROVER_FAULTS = [
  "PROVER_FAILED",
  "PROVER_ARTIFACTS_MISSING",
  "PROVER_ARTIFACTS_FAILED",
  "WORKER_TIMEOUT",
  "WORKER_CRASHED",
  "WORKER_FAILED",
] as const satisfies readonly WalletErrorCode[];

/// The user-facing line for a wallet error, and whether it is `curated` or the raw SDK message.
export function walletErrorText(e: AnyWalletError): { text: string; curated: boolean } {
  if (isWalletError(e, "INVALID_ARGUMENT") && e.argument === "feeAsset") {
    return { text: DEPOSIT_FEE_ASSET_REFUSED, curated: true };
  }
  const copy = WALLET_CODE_COPY[e.code] as string | ((e: AnyWalletError) => string) | undefined;
  if (copy === undefined) return { text: e.message, curated: false };
  return { text: typeof copy === "string" ? copy : copy(e), curated: true };
}

const DEPOSIT_FEE_ASSET_REFUSED =
  "That token can't pay the relayer fee for this deposit. Pay it in the asset you're shielding.";

const WALLET_CODE_COPY: { [C in WalletErrorCode]?: string | ((e: WalletErrorOf<C>) => string) } = {
  INSUFFICIENT_BALANCE: "Insufficient balance for this amount.",
  NOTES_HELD: describeNotesHeld,
  INSUFFICIENT_COVER: describeInsufficientCover,
  FEE_ASSET_NOT_QUOTED: (e) =>
    e.accepted.length > 0
      ? "The relayer doesn't take that token for its fee. Pay it in another token."
      : "The relayer isn't quoting a fee in any token right now. Retry later.",
  FEE_ABOVE_LIMIT: (e) =>
    e.source === "maxFee"
      ? "The relayer's fee went up after you reviewed it. Nothing was sent; check the new fee and try again."
      : "The relayer's fee is above the limit set for it. Nothing was sent; retry later.",
  USER_REJECTED: (e) =>
    e.action === "send-tx" ? "Transaction rejected in wallet." : "Signature rejected in wallet.",
  RELAYER_REJECTED: describeRelayerRejected,
  SPEND_OUTCOME_UNKNOWN: (e) =>
    "The spend was sent but its outcome is unknown. Its funds stay reserved until " +
    `${formatTime(e.reservedUntil)}; check the explorer, or wait before retrying.`,
  QUOTE_STALE: "Prices moved since the quote. It has been refreshed — review and retry.",
  DEADLINE_PASSED: "The quote expired before it could be sent. Refresh and retry.",
  WALLET_CONFIG: (e) => `Wallet misconfigured: ${e.message}`,
  NETWORK_NOT_DEPLOYED: (e) => `Network not deployed: ${e.message}`,
  ENVIRONMENT: (e) => `Unsupported browser environment: ${e.message}`,
  NO_EVM_ACCOUNT: (e) => `Connect an EVM wallet to ${EVM_ACCOUNT_ACTION[e.operation]}.`,
  UNSUPPORTED_OPERATION: (e) => `Wallet adapter cannot satisfy this operation: ${e.message}`,
  RELAYER_TIMEOUT: "Relayer timed out. Retry shortly.",
  RELAYER_FAILED: "The relayer couldn't process the request. Retry shortly.",
  FMD_TIMEOUT: "Note discovery (FMD) timed out. Retry shortly.",
  FMD_FAILED: "Note discovery (FMD) request failed.",
  WIRE_FORMAT: "Unexpected response from the server. Retry shortly.",
  RPC_FAILED: "Couldn't reach the network. Check your connection and retry.",
  TX_REVERTED: "Transaction reverted on-chain. Check balance and slippage, then retry.",
  TX_MINING: "Transaction did not mine. Retry or check the explorer.",
  TREE_OUT_OF_SYNC: "Wallet is out of sync with the chain. It will resync — retry in a moment.",
  PROVER_FAILED: "Building the proof failed. Trying again restarts the prover.",
  PROVER_UNAVAILABLE: "Proving isn't available in this browser. Reload, or try another browser.",
  PROVER_ARTIFACTS_MISSING: "The prover's files are missing. Trying again fetches them.",
  PROVER_ARTIFACTS_FAILED:
    "The prover's files failed to download. Check your connection, then try again.",
  WORKER_TIMEOUT: "The prover took too long and was stopped. Trying again restarts it.",
  WORKER_CRASHED: "The prover stopped unexpectedly. Trying again restarts it.",
  WORKER_FAILED: "The prover stopped unexpectedly. Trying again restarts it.",
  X402_PAYMENT: "Payment required by the service was refused.",
};

const EVM_ACCOUNT_ACTION: Record<WalletErrorOf<"NO_EVM_ACCOUNT">["operation"], string> = {
  deposit: "deposit",
  cancelDeposit: "cancel a deposit",
  setupDepositAllowance: "set up deposits",
};

function describeNotesHeld(e: WalletErrorOf<"NOTES_HELD">): string {
  if (!e.retryable) return "Part of this balance is in pieces too small to spend. Send less.";
  if (e.held.reserved.count > 0) {
    return "Part of this balance is still tied up in an earlier send. Retry in a few minutes.";
  }
  return "Recently received funds aren't spendable yet. Retry in a moment.";
}

/// The spend runs with `autoConsolidate`, so by the time this surfaces a merge was tried or
/// could not help. Say "funds", never "notes": the user has no way to act on a note.
function describeInsufficientCover(e: WalletErrorOf<"INSUFFICIENT_COVER">): string {
  if (e.reason === "fee-slot") {
    return "This send has no room left to pay the relayer in another token. Pay the fee in the asset you're sending.";
  }
  if (e.consolidate.length === 0) return "Not enough of this asset for the amount and its fee.";
  return e.consolidationAttempted
    ? "Your funds are spread too thin for this amount, even after combining them. Send less, or wait a block and try again."
    : "Your funds are spread over too many small pieces for this amount. Send a smaller amount first.";
}

function formatTime(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
