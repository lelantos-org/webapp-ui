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

function describeRelayerRejected(e: RelayerRejected): string {
  if (e.reason === "nullifier-in-flight") {
    return "Another spend of these notes is still being processed. Wait for it to finish, then retry.";
  }
  if (e.reason === "nullifier-spent") {
    return "These notes were already spent. Resyncing — check the chain before retrying.";
  }
  return e.retryable
    ? "Relayer rejected the request. Retry shortly."
    : "Relayer rejected the request. Check the relayer logs or your network.";
}

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
  USER_REJECTED: (e) =>
    e.action === "send-tx" ? "Transaction rejected in wallet." : "Signature rejected in wallet.",
  RELAYER_REJECTED: describeRelayerRejected,
  SPEND_OUTCOME_UNKNOWN: (e) =>
    "The spend was sent but its outcome is unknown. Its notes stay reserved until " +
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
  PROVER_FAILED: "Proof generation failed. Reload to reset the prover and retry.",
  PROVER_UNAVAILABLE: "Proving isn't available in this browser. Reload, or try another browser.",
  PROVER_ARTIFACTS_MISSING: "Prover artifacts missing. Reload to refetch and retry.",
  PROVER_ARTIFACTS_FAILED: "Prover artifacts failed to load. Check your connection and reload.",
  WORKER_TIMEOUT: "A background worker timed out. Reload and retry.",
  WORKER_CRASHED: "A background worker failed. Reload to restart it and retry.",
  WORKER_FAILED: "A background worker failed. Reload to restart it and retry.",
  X402_PAYMENT: "Payment required by the service was refused.",
};

const EVM_ACCOUNT_ACTION: Record<WalletErrorOf<"NO_EVM_ACCOUNT">["operation"], string> = {
  deposit: "deposit",
  cancelDeposit: "cancel a deposit",
  setupDepositAllowance: "set up deposits",
};

function describeNotesHeld(e: WalletErrorOf<"NOTES_HELD">): string {
  if (!e.retryable) return "Part of this balance is in notes too small to spend. Send less.";
  const { count } = e.held.reserved;
  if (count > 0) {
    return `${count} note${count === 1 ? " is" : "s are"} still tied up in an earlier spend. Retry in a few minutes.`;
  }
  return "Recently received funds aren't spendable yet. Retry in a moment.";
}

function describeInsufficientCover(e: WalletErrorOf<"INSUFFICIENT_COVER">): string {
  const head = "Insufficient cover.";
  if (e.reason === "fee-slot") {
    return `${head} Pay the relayer in the asset you're sending, or merge its notes first.`;
  }
  const n = e.consolidate.length;
  if (n === 0) return `${head} Top up the asset balance.`;
  const tip = e.consolidationAttempted
    ? "Merging notes didn't free up enough — pay the relayer in the asset you're sending, " +
      "or wait a block and retry."
    : `Consolidate ${n} smallest note${n === 1 ? "" : "s"} first.`;
  return `${head} ${tip}`;
}

function formatTime(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
