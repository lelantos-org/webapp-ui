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
  /// Outcome unobserved (no receipts, or timed out). Terminal, but the tx may have succeeded.
  | "unknown";

export interface Step {
  id: TxPhase;
  /// The step as a plan, before it starts; the fallback label.
  label: string;
  /// While it runs: "Building the zero-knowledge proof".
  activeLabel?: string;
  /// Once it is behind the user: "Built the zero-knowledge proof".
  doneLabel?: string;
  /// One sentence under the label while the step is current.
  detail?: string;
}

export interface StepsOpts {
  asEth?: boolean;
  needsApproval?: boolean;
  /// AllowanceTransfer-mode deposit: no per-deposit Permit2 signature, so no `signing` step.
  allowanceTransfer?: boolean;
}

type StepCopy = Omit<Step, "id">;

/// Copy for a note-spending op. Say "funds", never "notes".
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

/// Copy for a deposit.
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
    return (["preparing", "proving", "submitting", "mined"] as const).map((id) => ({
      id,
      ...SPEND[id],
    }));
  }
  const tail = (["submitting", "broadcast", "mined"] as const).map((id) => ({
    id,
    ...DEPOSIT[id],
  }));
  if (opts.asEth || opts.allowanceTransfer) return tail;
  const out: Step[] = [];
  if (opts.needsApproval) out.push({ id: "approving", ...DEPOSIT.approving });
  out.push({ id: "signing", ...DEPOSIT.signing }, ...tail);
  return out;
}

/// Whether a step list describes a deposit: only deposits have `broadcast`.
export function isDepositSteps(steps: readonly Pick<Step, "id">[]): boolean {
  return steps.some((s) => s.id === "broadcast");
}

export function isTerminal(phase: TxPhase | undefined): boolean {
  return phase === "flushed" || phase === "settled" || phase === "failed" || phase === "unknown";
}

/// Phase that closes the stepper: `flushed` for a deposit, else the last step.
export function terminalOf(steps: readonly Pick<Step, "id">[]): TxPhase | undefined {
  return isDepositSteps(steps) ? "flushed" : steps[steps.length - 1]?.id;
}
