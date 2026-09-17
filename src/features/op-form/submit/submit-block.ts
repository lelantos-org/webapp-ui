import { type FeeBlock, feeBlockReason } from "@/features/fees";

/// Whether a submit is dead, and the sentence shown under the button.
export interface SubmitBlock {
  disabled: boolean;
  /// Absent when nothing blocks, or the reason is already shown beside its field.
  reason?: string | undefined;
}

/// Nothing stops the submit.
export const SUBMIT_OPEN: SubmitBlock = Object.freeze({ disabled: false });

/// A dead button, with the sentence under it where there is one to say.
export function blockedBy(reason?: string): SubmitBlock {
  return reason === undefined ? { disabled: true } : { disabled: true, reason };
}

export interface WalletReadiness {
  /// The last sync failed; a spend against stale balances can pick already-spent notes.
  syncErrored: boolean;
  /// First sync still running, so there are no balances to validate against.
  balancesLoading: boolean;
}

/// Blocks while balances are stale or uncounted; `activity` names what is paused ("sending").
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

/// The reason shown for an empty amount.
export const ENTER_AMOUNT_REASON = "Enter an amount you hold";

export interface AmountReadiness {
  amountValid: boolean;
  /// Distinguishes "not filled in" from "filled in wrongly".
  amountEntered: boolean;
}

/// Blocks an invalid amount, with a reason only when it is empty.
export function amountBlock(s: AmountReadiness): SubmitBlock | undefined {
  if (s.amountValid) return undefined;
  return s.amountEntered ? blockedBy() : blockedBy(ENTER_AMOUNT_REASON);
}

/// Blocks a relayer fee that cannot be paid.
export function feeProblemBlock(feeBlock: FeeBlock | undefined): SubmitBlock | undefined {
  return feeBlock ? blockedBy(feeBlockReason(feeBlock)) : undefined;
}

/// Blocks while the relayer fee is still being quoted.
export function feePendingBlock(feePending: boolean): SubmitBlock | undefined {
  return feePending ? blockedBy("Working out the fee…") : undefined;
}

export interface FeeReadiness {
  /// From `useFeePanel().block`.
  feeBlock: FeeBlock | undefined;
  /// From `useFeePanel().pending`.
  feePending: boolean;
}

/// Fee problem, then fee pending.
export function feeBlockTail(s: FeeReadiness): SubmitBlock | undefined {
  return feeProblemBlock(s.feeBlock) ?? feePendingBlock(s.feePending);
}
