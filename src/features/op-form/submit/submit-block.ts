import { FEE_PENDING_REASON, type FeeBlock, feeBlockReason } from "@/features/fees";
import { normalizeNumericInput } from "@/shared/lib/format/number";

export interface SubmitBlock {
  disabled: boolean;
  /// Shown under the button. Absent when nothing blocks or the field already shows the reason.
  reason?: string | undefined;
}

export const SUBMIT_OPEN: SubmitBlock = Object.freeze({ disabled: false });

export function blockedBy(reason?: string): SubmitBlock {
  return reason === undefined ? { disabled: true } : { disabled: true, reason };
}

export interface WalletReadiness {
  /// The last sync failed; a spend against stale balances can pick already-spent notes.
  syncErrored: boolean;
  /// The first sync is still running; there are no balances to validate against.
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

export const ENTER_AMOUNT_REASON = "Enter an amount you hold";

/// The active chain registers nothing to spend.
export const NO_ASSETS_REASON = "No assets on this network";

/// Why typed text is not an amount to send, or `undefined` when it parses to a positive one.
/// `parsed` is the text in circuit units, `undefined` when it does not parse. `enter` is what an
/// empty, zero or half-typed amount is answered with.
export function amountTextReason(
  amountText: string,
  parsed: bigint | undefined,
  symbol: string | undefined,
  enter: string = ENTER_AMOUNT_REASON,
): string | undefined {
  const text = normalizeNumericInput(amountText);
  if (text === "") return enter;
  if (parsed !== undefined) return parsed > 0n ? undefined : enter;
  // A number still being typed ("12.").
  if (/^\d*\.?$/.test(text)) return enter;
  return /^\d+\.\d+$/.test(text)
    ? `${symbol ?? "This asset"} can't be split that finely`
    : "Enter the amount as a number";
}

export interface AmountReadiness {
  amountValid: boolean;
  /// From `amountTextReason`. An amount over a limit has none: the field reports that itself.
  amountReason: string | undefined;
}

/// Blocks an invalid amount, saying why unless the field already does.
export function amountBlock(s: AmountReadiness): SubmitBlock | undefined {
  return s.amountValid ? undefined : blockedBy(s.amountReason);
}

export function feeProblemBlock(feeBlock: FeeBlock | undefined): SubmitBlock | undefined {
  return feeBlock ? blockedBy(feeBlockReason(feeBlock)) : undefined;
}

export function feePendingBlock(feePending: boolean): SubmitBlock | undefined {
  return feePending ? blockedBy(FEE_PENDING_REASON) : undefined;
}

export interface FeeReadiness {
  /// From `useFeePanel().block`.
  feeBlock: FeeBlock | undefined;
  /// From `useFeePanel().pending`.
  feePending: boolean;
}

export function feeBlockTail(s: FeeReadiness): SubmitBlock | undefined {
  return feeProblemBlock(s.feeBlock) ?? feePendingBlock(s.feePending);
}

const REVIEW_STALE_REASON = "This can no longer be sent as entered. Go back and check it.";

/// Why an open review's Confirm is held, or `undefined` when it may send. A block with no reason
/// of its own (the balance moved under the review) still holds it.
export function reviewBlockReason(block: SubmitBlock, feesPriced: boolean): string | undefined {
  if (block.disabled) return block.reason ?? REVIEW_STALE_REASON;
  return feesPriced ? undefined : FEE_PENDING_REASON;
}
