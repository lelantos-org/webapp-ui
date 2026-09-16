// Step model for the tx progress card.
//
// Each shielded op declares an ordered list of phases. The form renders them as
// the steps of `TxProgressCard`, and the mutation hook and lifecycle tracker
// advance the `phase` field as work proceeds. Phases that do not apply to an op —
// `approving` on a deposit whose token is already approved, say — are omitted from
// the list rather than hidden, so the step count matches the number of wallet
// prompts to expect.
//
// The copy lives here, beside the phases it describes, rather than in the form:
// `submitting` and `mined` mean different things on a deposit (the user's wallet
// sends it; the relayer later adds it to the pool) and on a spend (the relayer
// sends it; a block includes it), and only the step list knows which op it is.

import type { OpKind } from "@/shared/domain/op-kind";

export type TxPhase =
  | "wrapping"
  | "approving"
  | "signing"
  | "preparing"
  | "proving"
  | "submitting"
  | "broadcast"
  | "mined"
  | "flushed"
  | "settled"
  | "failed"
  /// The lifecycle stopped without learning the outcome: the adapter cannot read
  /// receipts, or a timeout fired. Terminal, so the stepper stops spinning, but
  /// distinct from `failed` — the tx may have succeeded, and the accompanying
  /// toast links to the explorer.
  | "unknown";

export interface Step {
  id: TxPhase;
  /// The step as a plan, before it starts: "Build the zero-knowledge proof". Also
  /// the only label a caller that knows nothing of the other two reads.
  label: string;
  /// While it runs: "Building the zero-knowledge proof".
  activeLabel?: string;
  /// Once it is behind the user: "Built the zero-knowledge proof".
  doneLabel?: string;
  /// One sentence under the label while the step is current, where the wait
  /// needs explaining.
  detail?: string;
}

export interface StepsOpts {
  asEth?: boolean;
  needsApproval?: boolean;
  /// AllowanceTransfer-mode deposit. The allowance window covers the pull, so no
  /// per-deposit Permit2 signature is needed and the stepper drops `signing`.
  /// Setup itself runs in the standalone SetupFlow modal, never inline.
  allowanceTransfer?: boolean;
}

type StepCopy = Omit<Step, "id">;

/// A note-spending op: transfer, withdraw, swap. The relayer, not the user's
/// account, puts these on-chain — which is why handing off is the step that
/// ends the tab's part in it.
///
/// "Funds", never "notes": the labels are read by someone watching a transfer,
/// and the split of a balance into notes is the wallet's business, not theirs.
const SPEND = {
  preparing: {
    label: "Pick the funds to spend",
    activeLabel: "Picking the funds to spend",
    doneLabel: "Picked the funds to spend",
  },
  proving: {
    label: "Build the zero-knowledge proof",
    activeLabel: "Building the zero-knowledge proof",
    doneLabel: "Built the zero-knowledge proof",
    detail:
      "This is the slow part. Your device is proving you own the funds without revealing which ones.",
  },
  submitting: {
    label: "Hand to the relayer",
    activeLabel: "Handing to the relayer",
    doneLabel: "Handed to the relayer",
    detail: "The relayer puts it on-chain, so it is not sent from your public account.",
  },
  mined: {
    label: "Confirmed on-chain",
    activeLabel: "Waiting for the block",
    doneLabel: "Confirmed on-chain",
  },
} satisfies Partial<Record<TxPhase, StepCopy>>;

/// A deposit: the user's own wallet sends it, and the relayer adds it to the
/// pool in a later batch.
const DEPOSIT = {
  approving: {
    label: "Approve the token once",
    activeLabel: "Approving the token",
    doneLabel: "Approved the token",
    detail: "A one-time transaction from your wallet. Later shields of this token skip it.",
  },
  signing: {
    label: "Sign the transfer permit",
    activeLabel: "Signing the transfer permit",
    doneLabel: "Signed the transfer permit",
    detail: "A signature, not a transaction: it lets the pool take exactly this amount.",
  },
  submitting: {
    label: "Confirm in your wallet",
    activeLabel: "Confirm in your wallet",
    doneLabel: "Confirmed in your wallet",
    detail: "Your wallet sends the deposit from your public account.",
  },
  broadcast: {
    label: "Included in a block",
    activeLabel: "Waiting for the block",
    doneLabel: "Included in a block",
  },
  mined: {
    label: "Added to the pool",
    activeLabel: "Waiting for the relayer to add it",
    doneLabel: "Added to the pool",
    detail: "The relayer adds deposits in batches, so this can take a few minutes.",
  },
} satisfies Partial<Record<TxPhase, StepCopy>>;

export function stepsFor(kind: OpKind, opts: StepsOpts = {}): Step[] {
  if (kind !== "deposit") {
    // The card terminates at `mined`, when block inclusion is confirmed.
    // `settled` (scanner catch-up) is tracked downstream for pending overlays
    // and balance refresh but is not shown here. Swap shares this shape, since
    // its leg-1 is a transact proof like withdraw and the relayer carries leg 2.
    return (["preparing", "proving", "submitting", "mined"] as const).map((id) => ({
      id,
      ...SPEND[id],
    }));
  }
  // Deposit. Phase mapping:
  //   submitting → wallet prompt open
  //   broadcast  → signed and sent, awaiting a block
  //   mined      → included, awaiting the relayer's flush
  //   flushed    → terminal (`terminalOf`), so the last step completes only
  //                once the relayer has flushed.
  const tail = (["submitting", "broadcast", "mined"] as const).map((id) => ({
    id,
    ...DEPOSIT[id],
  }));
  // Native-ETH path: a single payable tx, no Permit2. AllowanceTransfer path:
  // the pre-signed window covers the pull, so neither an approval nor a
  // per-deposit signature is needed.
  if (opts.asEth || opts.allowanceTransfer) return tail;
  // Witness path: per-deposit Permit2 signature, plus a first-time approve.
  const out: Step[] = [];
  if (opts.needsApproval) out.push({ id: "approving", ...DEPOSIT.approving });
  out.push({ id: "signing", ...DEPOSIT.signing }, ...tail);
  return out;
}

/// Whether a step list describes a deposit rather than a spend.
///
/// Read off the list rather than threaded through as a kind: the list is what
/// the form already holds, and `broadcast` appears only where the user's own
/// wallet sends the transaction.
export function isDepositSteps(steps: readonly Pick<Step, "id">[]): boolean {
  return steps.some((s) => s.id === "broadcast");
}

export function isTerminal(phase: TxPhase | undefined): boolean {
  return phase === "flushed" || phase === "settled" || phase === "failed" || phase === "unknown";
}

/// Phase that closes out the stepper for a step list.
///
/// For a deposit the last step (`mined`) is not terminal: it stays current until
/// the relayer flushes, which `flushed` then closes. For the spend ops the
/// user-visible terminal is their last step, `mined`, so the form completes
/// without waiting for scanner catch-up.
export function terminalOf(steps: readonly Pick<Step, "id">[]): TxPhase | undefined {
  return isDepositSteps(steps) ? "flushed" : steps[steps.length - 1]?.id;
}
