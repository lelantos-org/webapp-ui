// The SDK's `WalletError` codes, in the user's terms.

import {
  type AnyWalletError,
  isWalletError,
  type WalletErrorCode,
  type WalletErrorOf,
} from "@lelantos-org/sdk";

type RelayerRejected = WalletErrorOf<"RELAYER_REJECTED">;

/// A spend the relayer refused because one of its nullifiers is already spent or
/// in flight.
///
/// Singled out because it is the one failure the local note store can be wrong
/// about: it still lists notes the chain has consumed, so every retry re-selects
/// them and is refused again until a resync drops them. Callers act on it rather
/// than only reporting it.
///
/// Only the wallet's `RELAYER_REJECTED` is read: the wallet turns every 409 from
/// the relayer into one, so a `RELAYER_FAILED` never carries a duplicate spend.
export function isDuplicateSpend(e: unknown): e is RelayerRejected {
  return (
    isWalletError(e, "RELAYER_REJECTED") &&
    (e.reason === "nullifier-spent" || e.reason === "nullifier-in-flight")
  );
}

/// What the relayer refused, in the user's terms.
///
/// The two duplicate-spend reasons call for different advice — one is a wait,
/// the other a resync — so they are worded apart rather than flattened into
/// "relayer rejected the request".
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

/// The user-facing line for a wallet error, plus whether it was written for that
/// code (`curated`) or is the SDK's own message passed through.
///
/// `userMessage` depends on the distinction: a curated line is final, while a
/// pass-through message is what the keyword heuristics apply to.
export function walletErrorText(e: AnyWalletError): { text: string; curated: boolean } {
  // A fee asset the pool would refuse for this deposit. The SDK's message names
  // asset ids, which mean nothing on screen.
  if (isWalletError(e, "INVALID_ARGUMENT") && e.argument === "feeAsset") {
    return { text: DEPOSIT_FEE_ASSET_REFUSED, curated: true };
  }
  // The table pairs each code with a function over that code's error, which a
  // lookup by a union-typed code cannot express; `e.code` selects the entry, so
  // the function always receives the error it was written for.
  const copy = WALLET_CODE_COPY[e.code] as string | ((e: AnyWalletError) => string) | undefined;
  if (copy === undefined) return { text: e.message, curated: false };
  return { text: typeof copy === "string" ? copy : copy(e), curated: true };
}

/// `INVALID_ARGUMENT` on `feeAsset`: native ETH paying the relayer in another
/// token, or a yield asset paying for another asset's deposit.
const DEPOSIT_FEE_ASSET_REFUSED =
  "That token can't pay the relayer fee for this deposit. Pay it in the asset you're shielding.";

/// The line written for each code. Anything else — `INVALID_ARGUMENT`, which
/// already carries a user-readable message, or a code added by a newer SDK,
/// whose list is documented as open — falls through to the raw message and the
/// keyword pass.
const WALLET_CODE_COPY: { [C in WalletErrorCode]?: string | ((e: WalletErrorOf<C>) => string) } = {
  // Funds.
  // Amounts are circuit units of an asset this module cannot see, so none is
  // rendered: a bare integer on screen reads as a wrong balance.
  INSUFFICIENT_BALANCE: "Insufficient balance for this amount.",
  NOTES_HELD: describeNotesHeld,
  INSUFFICIENT_COVER: describeInsufficientCover,
  FEE_ASSET_NOT_QUOTED: (e) =>
    e.accepted.length > 0
      ? "The relayer doesn't take that token for its fee. Pay it in another token."
      : "The relayer isn't quoting a fee in any token right now. Retry later.",
  // Submission.
  USER_REJECTED: (e) =>
    e.action === "send-tx" ? "Transaction rejected in wallet." : "Signature rejected in wallet.",
  RELAYER_REJECTED: describeRelayerRejected,
  SPEND_OUTCOME_UNKNOWN: (e) =>
    "The spend was sent but its outcome is unknown. Its notes stay reserved until " +
    `${formatTime(e.reservedUntil)}; check the explorer, or wait before retrying.`,
  // Every quote the app runs is re-requested on this code, so the fresh one is
  // already on screen by the time the user reads this.
  QUOTE_STALE: "Prices moved since the quote. It has been refreshed — review and retry.",
  DEADLINE_PASSED: "The quote expired before it could be sent. Refresh and retry.",
  // Configuration.
  WALLET_CONFIG: (e) => `Wallet misconfigured: ${e.message}`,
  NETWORK_NOT_DEPLOYED: (e) => `Network not deployed: ${e.message}`,
  ENVIRONMENT: (e) => `Unsupported browser environment: ${e.message}`,
  NO_EVM_ACCOUNT: (e) => `Connect an EVM wallet to ${EVM_ACCOUNT_ACTION[e.operation]}.`,
  UNSUPPORTED_OPERATION: (e) => `Wallet adapter cannot satisfy this operation: ${e.message}`,
  // Transport. `RELAYER_FAILED` is what a relayer 5xx stays: a refusal is
  // `RELAYER_REJECTED`.
  RELAYER_TIMEOUT: "Relayer timed out. Retry shortly.",
  RELAYER_FAILED: "The relayer couldn't process the request. Retry shortly.",
  FMD_TIMEOUT: "Note discovery (FMD) timed out. Retry shortly.",
  FMD_FAILED: "Note discovery (FMD) request failed.",
  WIRE_FORMAT: "Unexpected response from the server. Retry shortly.",
  // Chain.
  RPC_FAILED: "Couldn't reach the network. Check your connection and retry.",
  TX_REVERTED: "Transaction reverted on-chain. Check balance and slippage, then retry.",
  TX_MINING: "Transaction did not mine. Retry or check the explorer.",
  TREE_OUT_OF_SYNC: "Wallet is out of sync with the chain. It will resync — retry in a moment.",
  // Prover and workers.
  PROVER_FAILED: "Proof generation failed. Reload to reset the prover and retry.",
  PROVER_UNAVAILABLE: "Proving isn't available in this browser. Reload, or try another browser.",
  PROVER_ARTIFACTS_MISSING: "Prover artifacts missing. Reload to refetch and retry.",
  PROVER_ARTIFACTS_FAILED: "Prover artifacts failed to load. Check your connection and reload.",
  WORKER_TIMEOUT: "A background worker timed out. Reload and retry.",
  WORKER_CRASHED: "A background worker failed. Reload to restart it and retry.",
  WORKER_FAILED: "A background worker failed. Reload to restart it and retry.",
  X402_PAYMENT: "Payment required by the service was refused.",
};

/// `NO_EVM_ACCOUNT`'s operation, as the end of "Connect an EVM wallet to …".
const EVM_ACCOUNT_ACTION: Record<WalletErrorOf<"NO_EVM_ACCOUNT">["operation"], string> = {
  deposit: "deposit",
  cancelDeposit: "cancel a deposit",
  setupDepositAllowance: "set up deposits",
};

/// Notes held back from selection. `retryable` separates a wait (reserved by
/// another spend, or still cooling down) from dust, which no wait releases.
function describeNotesHeld(e: WalletErrorOf<"NOTES_HELD">): string {
  if (!e.retryable) return "Part of this balance is in notes too small to spend. Send less.";
  const { count } = e.held.reserved;
  if (count > 0) {
    return `${count} note${count === 1 ? " is" : "s are"} still tied up in an earlier spend. Retry in a few minutes.`;
  }
  return "Recently received funds aren't spendable yet. Retry in a moment.";
}

function describeInsufficientCover(e: WalletErrorOf<"INSUFFICIENT_COVER">): string {
  // No target amount: it is in circuit units, which read as a wrong figure.
  const head = "Insufficient cover.";
  // Every input slot went to the asset being moved, so a note in another asset
  // has nowhere to pay the fee from. Paying in the moved asset needs no slot.
  if (e.reason === "fee-slot") {
    return `${head} Pay the relayer in the asset you're sending, or merge its notes first.`;
  }
  const n = e.consolidate.length;
  if (n === 0) return `${head} Top up the asset balance.`;
  // The wallet always requests consolidation, so `consolidationAttempted`
  // is what distinguishes a cover that consolidation could still fix from
  // one where it has already run and failed.
  const tip = e.consolidationAttempted
    ? "Merging notes didn't free up enough — pay the relayer in the asset you're sending, " +
      "or wait a block and retry."
    : `Consolidate ${n} smallest note${n === 1 ? "" : "s"} first.`;
  return `${head} ${tip}`;
}

/// A wall-clock time in the user's locale, to the minute.
function formatTime(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
