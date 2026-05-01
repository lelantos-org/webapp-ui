// Step model for the inline tx progress bar.
//
// Each shielded op declares an ordered list of phases. The form renders
// these as a stepper; the mutation hook + lifecycle tracker advance the
// `phase` field as work proceeds. Phases that don't apply to a given op
// (e.g. `wrapping` on a non-ETH deposit) are *omitted* from the step
// list, not just hidden — the step count matches the number of MetaMask
// prompts to expect.

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
  | "failed";

export interface Step {
  id: TxPhase;
  label: string;
}

export type ShieldedKind = "deposit" | "transfer" | "withdraw" | "withdrawEth" | "swap";

export interface StepsOpts {
  asEth?: boolean;
  needsApproval?: boolean;
  /// AllowanceTransfer-mode deposit. Per-deposit Permit2 sig is gone (the
  /// allowance window covers the pull), so the stepper drops `signing`.
  /// Setup itself runs in the standalone SetupFlow modal — never inline.
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
};

function step(id: TxPhase): Step {
  return { id, label: LABELS[id] };
}

export function stepsFor(kind: ShieldedKind, opts: StepsOpts = {}): Step[] {
  switch (kind) {
    case "deposit":
    case "withdrawEth": // not actually a deposit kind, kept for exhaustiveness
      break;
    case "transfer":
    case "withdraw":
    case "swap":
      // Stepper terminates at `mined` — fires when block inclusion is
      // confirmed and the toast appears. `settled` (scanner-catchup) is
      // still tracked downstream (pending overlays, balance refresh) but
      // not user-visible in the inline stepper. Swap shares the spend
      // shape: leg-1 is a transact_2x2 just like withdraw.
      return [
        step("preparing"),
        step("proving"),
        step("submitting"),
        { id: "mined", label: "completed" },
      ];
  }
  // deposit. Three user-visible transitions:
  //   sign tx (green when user signs in MetaMask)
  //   pending deposit (green when the tx is mined on chain)
  //   deposit accepted (green when the relayer flushes the batch)
  // Phase mapping:
  //   submitting → step1 current (MetaMask popup open)
  //   broadcast  → step1 done, step2 current (user signed; awaiting block)
  //   mined      → step2 done, step3 current (block included; awaiting flush)
  //   flushed    → terminal — done set via stepsFor's `terminal` hint, so
  //                step3 lights only when the relayer actually flushed.
  const sign: Step = { id: "submitting", label: "sign transaction" };
  const pending: Step = { id: "broadcast", label: "pending deposit" };
  const accepted: Step = { id: "mined", label: "deposit accepted" };
  if (opts.asEth) {
    // Native-ETH path — single payable tx, no Permit2.
    return [sign, pending, accepted];
  }
  if (opts.allowanceTransfer) {
    // AllowanceTransfer path — pre-signed window covers the pull. No
    // approve, no per-deposit sig: just the intent tx.
    return [sign, pending, accepted];
  }
  // Legacy witness path.
  const out: Step[] = [];
  if (opts.needsApproval) out.push(step("approving"));
  out.push(step("signing"), sign, pending, accepted);
  return out;
}

export function isTerminal(phase: TxPhase | undefined): boolean {
  return phase === "flushed" || phase === "settled" || phase === "failed";
}

/// Phase that closes out the stepper for a given op. For deposits the
/// stepper's last step (`mined`) is *not* the terminal — it stays `current`
/// (spinner) until the relayer flushes; `flushed` overrides that. For spend
/// ops (transfer/withdraw/swap) the user-visible terminal IS `mined` so the
/// form completes promptly without waiting for scanner catch-up.
export function terminalFor(kind: ShieldedKind, _opts: StepsOpts = {}): TxPhase {
  if (kind === "deposit") return "flushed";
  // withdrawEth lands in the spend bucket — its last step is `mined`.
  return "mined";
}
