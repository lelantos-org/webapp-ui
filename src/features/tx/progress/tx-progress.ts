import type { OpKind } from "@/shared/domain/op-kind";

export type TxPhase =
  | "wrapping"
  | "approving"
  | "signing"
  /// A claim link's address is being reserved, before the spend starts.
  | "reserving"
  | "preparing"
  /// The funds are spread over more pieces than one spend takes, and are being merged first.
  | "consolidating"
  /// The prover and its proving key are being fetched: the first proof on a device.
  | "fetching-prover"
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
  /// A spend whose prover is not loaded yet: adds the step that fetches it.
  coldProver?: boolean;
}

type StepCopy = Omit<Step, "id">;

/// Copy for a note-spending op. Say "funds", never "notes".
const SPEND = {
  preparing: {
    label: "Pick the funds to spend",
    activeLabel: "Picking the funds to spend",
    doneLabel: "Picked the funds to spend",
  },
  "fetching-prover": {
    label: "Download the prover",
    activeLabel: "Downloading the prover",
    doneLabel: "Downloaded the prover",
    detail: "A one-time download of about 20 MB. Later transactions on this device skip it.",
  },
  proving: {
    label: "Build the zero-knowledge proof",
    activeLabel: "Building the zero-knowledge proof",
    doneLabel: "Built the zero-knowledge proof",
    detail:
      "This is the slow part. Your device is proving you own the funds without revealing which ones.",
  },
  // The relayer answers only once the transaction is mined, so this step lasts until the block.
  submitting: {
    label: "Hand to the relayer",
    activeLabel: "The relayer is putting it on-chain",
    doneLabel: "Handed to the relayer",
    detail:
      "The relayer sends it, so it does not come from your public account. This lasts until it is in a block.",
  },
  mined: {
    label: "Confirmed on-chain",
    activeLabel: "Confirming on-chain",
    doneLabel: "Confirmed on-chain",
  },
} satisfies Partial<Record<TxPhase, StepCopy>>;

/// Shown only when it happens: most spends need no merge.
const CONSOLIDATING: Step = {
  id: "consolidating",
  label: "Combine your funds",
  activeLabel: "Combining your funds first",
  doneLabel: "Combined your funds",
  detail:
    "This amount is spread over more pieces than one transaction can spend, so they are merged first. That is one extra proof and one extra relayer fee.",
};

/// `steps` with the merge step after picking the funds, where it is not there already.
export function withConsolidation(steps: Step[]): Step[] {
  if (steps.some((s) => s.id === CONSOLIDATING.id)) return steps;
  const at = steps.findIndex((s) => s.id === "preparing");
  return [...steps.slice(0, at + 1), CONSOLIDATING, ...steps.slice(at + 1)];
}

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
    const ids = opts.coldProver
      ? (["preparing", "fetching-prover", "proving", "submitting", "mined"] as const)
      : (["preparing", "proving", "submitting", "mined"] as const);
    return ids.map((id) => ({ id, ...SPEND[id] }));
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

/// Whether an op is still under way: its mutation is running, or it was sent and the tracker is
/// still walking its steps.
export function opInFlight(op: {
  running: boolean;
  /// The op was broadcast: its mutation resolved with a tx.
  sent: boolean;
  steps: readonly Pick<Step, "id">[];
  done: boolean;
  phase: TxPhase | undefined;
}): boolean {
  if (op.running) return true;
  return op.sent && op.steps.length > 0 && !op.done && op.phase !== "failed";
}

/// Phase that closes the stepper: `flushed` for a deposit, else the last step.
export function terminalOf(steps: readonly Pick<Step, "id">[]): TxPhase | undefined {
  return isDepositSteps(steps) ? "flushed" : steps[steps.length - 1]?.id;
}
