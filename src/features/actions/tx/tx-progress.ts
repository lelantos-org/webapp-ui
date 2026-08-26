// Step model for the inline tx progress bar.
//
// Each shielded op declares an ordered list of phases. The form renders them as a
// stepper, and the mutation hook and lifecycle tracker advance the `phase` field
// as work proceeds. Phases that do not apply to an op — `wrapping` on a non-ETH
// deposit, say — are omitted from the list rather than hidden, so the step count
// matches the number of wallet prompts to expect.

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
  label: string;
}

export type ShieldedKind = "deposit" | "transfer" | "withdraw" | "withdrawEth" | "swap";

export interface StepsOpts {
  asEth?: boolean;
  needsApproval?: boolean;
  /// AllowanceTransfer-mode deposit. The allowance window covers the pull, so no
  /// per-deposit Permit2 signature is needed and the stepper drops `signing`.
  /// Setup itself runs in the standalone SetupFlow modal, never inline.
  allowanceTransfer?: boolean;
}

const LABELS: Record<TxPhase, string> = {
  wrapping: "wrap ETH",
  approving: "approve permit2",
  signing: "sign permit2",
  preparing: "select notes",
  proving: "generate proof",
  submitting: "submit",
  broadcast: "broadcasting",
  mined: "on-chain",
  flushed: "flushed by relayer",
  settled: "scanner caught up",
  failed: "failed",
  unknown: "status unknown",
};

function step(id: TxPhase): Step {
  return { id, label: LABELS[id] };
}

export function stepsFor(kind: ShieldedKind, opts: StepsOpts = {}): Step[] {
  switch (kind) {
    case "deposit":
    case "withdrawEth": // spend kind, listed to keep the switch exhaustive
      break;
    case "transfer":
    case "withdraw":
    case "swap":
      // The stepper terminates at `mined`, when block inclusion is confirmed.
      // `settled` (scanner catch-up) is tracked downstream for pending overlays
      // and balance refresh but is not shown here. Swap shares this shape, since
      // its leg-1 is a transact proof like withdraw.
      return [
        step("preparing"),
        step("proving"),
        step("submitting"),
        { id: "mined", label: "completed" },
      ];
  }
  // Deposit. Three user-visible transitions:
  //   sign tx          — completed when the user signs in the wallet
  //   pending deposit  — completed when the tx is mined on chain
  //   deposit accepted — completed when the relayer flushes the batch
  // Phase mapping:
  //   submitting → step 1 current (wallet prompt open)
  //   broadcast  → step 1 done, step 2 current (signed, awaiting block)
  //   mined      → step 2 done, step 3 current (included, awaiting flush)
  //   flushed    → terminal, set via the `terminal` hint, so step 3 completes
  //                only once the relayer has flushed.
  const sign: Step = { id: "submitting", label: "sign transaction" };
  const pending: Step = { id: "broadcast", label: "pending deposit" };
  const accepted: Step = { id: "mined", label: "deposit accepted" };
  if (opts.asEth) {
    // Native-ETH path: a single payable tx, no Permit2.
    return [sign, pending, accepted];
  }
  if (opts.allowanceTransfer) {
    // AllowanceTransfer path: the pre-signed window covers the pull, so neither
    // an approval nor a per-deposit signature is needed.
    return [sign, pending, accepted];
  }
  // Witness path: per-deposit Permit2 signature, plus a first-time approve.
  const out: Step[] = [];
  if (opts.needsApproval) out.push(step("approving"));
  out.push(step("signing"), sign, pending, accepted);
  return out;
}

export function isTerminal(phase: TxPhase | undefined): boolean {
  return phase === "flushed" || phase === "settled" || phase === "failed" || phase === "unknown";
}

/// Phase that closes out the stepper for a given op.
///
/// For a deposit the last step (`mined`) is not terminal: it stays current until
/// the relayer flushes, which `flushed` then closes. For the spend ops the
/// user-visible terminal is `mined`, so the form completes without waiting for
/// scanner catch-up.
export function terminalFor(kind: ShieldedKind, _opts: StepsOpts = {}): TxPhase {
  if (kind === "deposit") return "flushed";
  // withdrawEth is a spend, so its last step is `mined`.
  return "mined";
}
