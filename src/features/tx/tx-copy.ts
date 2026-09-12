// What the progress and failure cards may truthfully say about an op, by stage.
//
// Two sentences carry a promise about the user's money, and both depend on how
// far the op got:
//
//   * the walk-away note — whether closing the tab now stops the op; and
//   * the failure reassurance — whether anything was spent, and whether trying
//     again is safe.
//
// Neither has one version that holds for every op at every stage ("After that
// you can leave — we'll finish in the background and tell you when it lands";
// "Your funds never left the pool — nothing was spent"): nothing in
// the app notifies anyone after the tab closes, and a deposit that failed after
// the wallet sent it may still land. So the lines are chosen here, from the step
// list and the last phase reached, and a stage this module cannot vouch for gets
// the cautious line rather than the reassuring one.
//
// What is true, per op, from the SDK:
//
//   * Spend (transfer, withdraw, swap). Notes are picked and the proof built in
//     this tab; closing it before `submitting` abandons the op and spends
//     nothing. `submitting` hands the payload to the relayer, which broadcasts it
//     from its own account and answers with the hash — both swap legs included —
//     so once the hash is back the tab is no longer needed. A retry cannot spend
//     the same notes twice: their nullifiers are refused on-chain.
//   * Deposit. Approve (first time, witness path), sign the permit, confirm in
//     the wallet: until the wallet sends it (`broadcast`) closing the tab stops
//     the shield and no tokens move. After that the transaction is the wallet's
//     and the chain's, and the relayer adds it to the pool from chain events —
//     the tab plays no part. A second try after `broadcast` is a second deposit.

import type { ReactNode } from "react";
import { isDepositSteps, type Step, type TxPhase } from "./tx-progress";

export interface TxStage {
  steps: readonly Pick<Step, "id">[];
  /// The phase in progress, or the last one reached before a failure.
  phase: TxPhase | undefined;
  /// The op's transaction hash is known. For a spend that means the relayer has
  /// taken it; for a deposit, that the wallet has sent it.
  hash: boolean;
}

function indexOf(steps: readonly Pick<Step, "id">[], phase: TxPhase | undefined): number {
  return phase === undefined ? -1 : steps.findIndex((s) => s.id === phase);
}

/// The phase is at or past `target` in this step list.
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

/// Whether "Try again" may be offered after a failure.
///
/// Withheld once the transaction may be on-chain: a deposit the wallet sent can
/// still land, so a retry would be a second deposit; a spend with a hash may have
/// gone through, and its notes are recorded as spent locally, so a retry could
/// pick different notes and send the amount twice.
export function retrySafe(stage: TxStage): boolean {
  return !handedOff(stage);
}

/// What a failure at this stage means for the user's funds.
export function failureReassurance(stage: TxStage): ReactNode {
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
