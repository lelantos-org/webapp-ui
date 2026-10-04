// Copy that makes promises about the user's funds: an unknown outcome gets the cautious line.

import { isDepositSteps, type Step, type TxPhase } from "./tx-progress";

export interface TxStage {
  steps: readonly Pick<Step, "id">[];
  /// The phase in progress, or the last one reached before a failure.
  phase: TxPhase | undefined;
  /// The tx hash is known: the relayer took the spend, or the wallet sent the deposit.
  hash: boolean;
  /// The spend failed without the relayer saying whether it took it.
  outcomeUnknown?: boolean;
}

function indexOf(steps: readonly Pick<Step, "id">[], phase: TxPhase | undefined): number {
  return phase === undefined ? -1 : steps.findIndex((s) => s.id === phase);
}

/// Whether the op has got as far as `target`, by its own step list.
export function reached(stage: Pick<TxStage, "steps" | "phase">, target: TxPhase): boolean {
  const at = indexOf(stage.steps, stage.phase);
  const t = indexOf(stage.steps, target);
  return at !== -1 && t !== -1 && at >= t;
}

/// The transaction is out of this tab's hands: closing the tab does not stop it.
export function handedOff(stage: TxStage): boolean {
  if (stage.hash || stage.outcomeUnknown) return true;
  return isDepositSteps(stage.steps) && reached(stage, "broadcast");
}

/// The line under the progress card's steps.
export function walkAwayNote(stage: TxStage): string {
  if (isDepositSteps(stage.steps)) {
    return handedOff(stage)
      ? "Your wallet has sent it, so closing this tab won't stop it. The relayer adds it to the pool on its own."
      : "Keep this tab open until your wallet sends the deposit. Closing it before then stops the shield, and no tokens move.";
  }
  if (handedOff(stage)) return "The relayer has it, so closing this tab won't stop it.";
  if (stage.phase === "submitting")
    return "Handing it to the relayer — keep this tab open a moment longer.";
  if (reached(stage, "consolidating")) {
    return "Keep this tab open until the proof is handed to the relayer. Closing it before then cancels the send; the merge of your funds, and its fee, may already have gone through.";
  }
  return "Keep this tab open until the proof is handed to the relayer. Closing it before then cancels this, and nothing is spent.";
}

/// Whether "Try again" may be offered: never once the tx may be on-chain, or funds could move twice.
export function retrySafe(stage: TxStage): boolean {
  return !handedOff(stage);
}

/// What a failure at this stage means for the user's funds.
export function failureReassurance(stage: TxStage): string {
  if (isDepositSteps(stage.steps)) {
    if (handedOff(stage)) {
      return "Your wallet sent the deposit, so it may still land. Check your wallet's activity before shielding again — another try would be a second deposit.";
    }
    const approved = stage.steps.some((s) => s.id === "approving") && reached(stage, "signing");
    return approved
      ? "Nothing was shielded and no tokens left your wallet. The one-time approval did go through, so trying again won't ask for it."
      : "Nothing was shielded and no tokens left your wallet. Trying again is safe.";
  }
  if (stage.outcomeUnknown) {
    return "The relayer may have sent this, so another try could pay twice. Check the explorer, or wait for your balance to update, before sending again.";
  }
  if (stage.hash) {
    return "It was sent, so check the explorer before trying again. If it reverted, your notes were not spent.";
  }
  if (stage.phase === "submitting") {
    return "The relayer didn't confirm it took this. Trying again is safe: the same notes can't be spent twice.";
  }
  if (reached(stage, "consolidating")) {
    return "Nothing was sent — your funds never left the pool, though merging them may have gone through, with its relayer fee. Trying again is safe.";
  }
  return "Nothing was sent — your funds never left the pool. Trying again is safe.";
}

export interface SettledCopy {
  title: string;
  /// The op was sent but not seen to land.
  unconfirmed: boolean;
  note: string | undefined;
}

/// The terminal card's copy. An op that ended `unknown` was sent but its outcome was never
/// observed, so it gets neither `title` nor a success mark.
export function settledCopy(
  endedAs: TxPhase | undefined,
  steps: readonly Pick<Step, "id">[],
  title: string,
): SettledCopy {
  if (endedAs !== "unknown") return { title, unconfirmed: false, note: undefined };
  return {
    title: "Sent, not confirmed yet",
    unconfirmed: true,
    note: isDepositSteps(steps)
      ? "Your wallet sent the deposit, but the relayer had not added it to the pool when we stopped watching. It joins your shielded balance once it does; check the explorer for its status."
      : "We stopped watching before it was confirmed. Check the explorer for its status.",
  };
}
