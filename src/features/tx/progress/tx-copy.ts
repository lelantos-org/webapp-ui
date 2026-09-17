// These lines promise things about the user's funds; a stage we cannot vouch for gets the cautious line.

import { isDepositSteps, type Step, type TxPhase } from "./tx-progress";

export interface TxStage {
  steps: readonly Pick<Step, "id">[];
  /// The phase in progress, or the last one reached before a failure.
  phase: TxPhase | undefined;
  /// The tx hash is known: the relayer took the spend, or the wallet sent the deposit.
  hash: boolean;
}

function indexOf(steps: readonly Pick<Step, "id">[], phase: TxPhase | undefined): number {
  return phase === undefined ? -1 : steps.findIndex((s) => s.id === phase);
}

function reached(stage: TxStage, target: TxPhase): boolean {
  const at = indexOf(stage.steps, stage.phase);
  const t = indexOf(stage.steps, target);
  return at !== -1 && t !== -1 && at >= t;
}

/// The transaction is out of this tab's hands: closing it no longer stops it.
export function handedOff(stage: TxStage): boolean {
  if (stage.hash) return true;
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
  if (stage.hash) {
    return "It was sent, so check the explorer before trying again. If it reverted, your notes were not spent.";
  }
  if (stage.phase === "submitting") {
    return "The relayer didn't confirm it took this. Trying again is safe: the same notes can't be spent twice.";
  }
  return "Nothing was sent — your funds never left the pool. Trying again is safe.";
}

/// A line for the settled card when the op ended without its outcome observed.
export function settledNote(endedAs: TxPhase | undefined): string | undefined {
  return endedAs === "unknown"
    ? "We stopped watching before it was confirmed. Check the explorer for its status."
    : undefined;
}
