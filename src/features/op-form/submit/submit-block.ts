// What stops a form's submit button, as one shape every form shares.
//
// Shield, Send, Unshield, Swap and Send by link each decide their own order of
// questions — that ordering is the substance, and it stays with each form — but
// they ask several of the same ones. Here the shared questions are stated once,
// each returning a whole block or nothing, so a form reads as the order it asks
// them in: `a ?? b ?? c ?? SUBMIT_OPEN`. `disabled` and its reason travel
// together, so a live button can never sit over an amount the field has already
// flagged.
//
// Every reason is a sentence-case sentence, because it is shown as one — under
// the button, not in a tooltip.

import { type FeeBlock, feeBlockReason } from "@/features/fees";

export interface SubmitBlock {
  disabled: boolean;
  /// Why, as the sentence under the button. Absent when nothing blocks the
  /// submit, or when the reason is already on screen beside the control it
  /// concerns — an amount the field itself flags.
  reason?: string | undefined;
}

/// Nothing stops the submit.
export const SUBMIT_OPEN: SubmitBlock = Object.freeze({ disabled: false });

/// A dead button, with the sentence under it where there is one to say.
export function blockedBy(reason?: string): SubmitBlock {
  return reason === undefined ? { disabled: true } : { disabled: true, reason };
}

export interface WalletReadiness {
  /// The last sync failed, so the balances on screen may be stale.
  ///
  /// A spend chosen against a stale balance can select notes the chain has
  /// already consumed, and the relayer refuses it only after the proof. Spends
  /// are paused until a sync succeeds; `SyncNotice` offers the retry.
  syncErrored: boolean;
  /// First sync still running, so there are no balances to validate against.
  ///
  /// Without this the amount validator compares against an empty balance set and
  /// rejects everything as insufficient funds, which reads as "you have nothing"
  /// rather than "we have not counted yet". `SyncNotice` says the same thing in
  /// prose above the form; this stops the button being pressable meanwhile.
  balancesLoading: boolean;
}

/// The wallet's own state, which every spend asks about first: against balances
/// that are stale or not yet counted, "enter an amount you hold" is a question
/// nobody can answer. A failed sync outranks one still running.
///
/// `activity` names what is paused: "sending", "swapping".
export function walletReadinessBlock(
  activity: string,
  s: WalletReadiness,
): SubmitBlock | undefined {
  if (s.syncErrored) {
    return blockedBy(
      `Balances are out of date — ${activity} is paused until the wallet catches up`,
    );
  }
  if (s.balancesLoading) return blockedBy("Still adding up your balance");
  return undefined;
}

/// What an empty or not-yet-positive amount is told, by every form that asks.
export const ENTER_AMOUNT_REASON = "Enter an amount you hold";

export interface AmountReadiness {
  /// The amount parses, is positive, and is within what can be spent.
  amountValid: boolean;
  /// Distinguishes "not filled in" from "filled in wrongly".
  amountEntered: boolean;
}

/// The amount, which blocks either way but only asks for something when it is
/// empty: an entered amount that is wrong is already stated under the figure,
/// and a second sentence under the button would repeat it.
export function amountBlock(s: AmountReadiness): SubmitBlock | undefined {
  if (s.amountValid) return undefined;
  return s.amountEntered ? blockedBy() : blockedBy(ENTER_AMOUNT_REASON);
}

/// A relayer that cannot be paid: a shortfall, a failed quote, or an asset it
/// will not take. Blocks, because the alternative is spending twenty to forty
/// seconds proving a spend that cannot settle.
export function feeProblemBlock(feeBlock: FeeBlock | undefined): SubmitBlock | undefined {
  return feeBlock ? blockedBy(feeBlockReason(feeBlock)) : undefined;
}

/// The relayer's charge is not known yet. Last, since it resolves on its own.
export function feePendingBlock(feePending: boolean): SubmitBlock | undefined {
  return feePending ? blockedBy("Working out the fee…") : undefined;
}

export interface FeeReadiness {
  /// From `useFeePanel().block`.
  feeBlock: FeeBlock | undefined;
  /// From `useFeePanel().pending`.
  feePending: boolean;
}

/// The two fee questions in the order most forms ask them.
export function feeBlockTail(s: FeeReadiness): SubmitBlock | undefined {
  return feeProblemBlock(s.feeBlock) ?? feePendingBlock(s.feePending);
}
