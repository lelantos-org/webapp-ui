// The rule for when a fee preview may be shown at all.
//
// The fee *lines* moved to `FeeSummary`, which has room to name the protocol
// and relayer charges separately. What is left here is the staleness gate they
// are both read through, and the hint joiner the amount field still uses.

import type { FeeBreakdown } from "@/shared/lib/fees";
import type { FeePreviewResult } from "../use-fee-preview";

/// The preview's data, or `undefined` while the debounce is catching up.
///
/// During that window `data` describes the *previous* keystroke's amount, and
/// this is the line the user reads immediately before clicking submit — so a
/// fee for one amount is never shown against another. Deposit validation gates
/// its submit button on the same absence (`feeUnknown`).
export function settledFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.stale ? undefined : fee.data;
}

/// The preview's data for *display*, held-over figures included.
///
/// The counterpart of `settledFee`, and the distinction is the point: a fee
/// panel that shows the previous amount's figure for a beat reads as a number
/// settling, while one that blanks on every keystroke reads as breakage. This
/// is never the value to gate a submit on.
export function shownFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.data;
}

/// Whether a protocol-fee figure is still on its way.
///
/// What the panel needs in order to hold a line open for it rather than
/// growing one when it lands. True only while there is nothing to show *and*
/// nothing has gone wrong: a failed read collapses the row and lets the retry
/// notice speak, instead of leaving a placeholder that never resolves.
export function feeIncoming(fee: FeePreviewResult): boolean {
  return fee.data === undefined && !fee.isError;
}

/// Join hint fragments with the separator the forms use, dropping empties.
export function joinHint(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length > 0 ? kept.join(" · ") : undefined;
}
