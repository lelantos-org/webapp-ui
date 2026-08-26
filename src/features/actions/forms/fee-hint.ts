// The staleness gate a fee preview is read through, plus the hint joiner the
// amount field uses. The fee lines themselves are rendered by `FeeSummary`.

import type { FeeBreakdown } from "@/shared/lib/fees";
import type { FeePreviewResult } from "../use-fee-preview";

/// The preview's data, or `undefined` while the debounce is catching up.
///
/// During that window `data` describes the previous keystroke's amount, so a fee
/// for one amount is never shown against another. Deposit validation gates its
/// submit button on the same absence (`feeUnknown`).
export function settledFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.stale ? undefined : fee.data;
}

/// The preview's data for display, including held-over figures.
///
/// The counterpart of `settledFee`: a panel showing the previous amount's figure
/// briefly reads as a number settling, where one blanking on every keystroke
/// reads as a failure. Never use this to gate a submit.
export function shownFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.data;
}

/// Whether a protocol-fee figure is still on its way.
///
/// Lets the panel hold a line open rather than growing one when the figure lands.
/// True only while there is nothing to show and nothing has failed: a failed read
/// collapses the row so the retry notice can take over, rather than leaving a
/// placeholder that never resolves.
export function feeIncoming(fee: FeePreviewResult): boolean {
  return fee.data === undefined && !fee.isError;
}

/// Join hint fragments with the separator the forms use, dropping empties.
export function joinHint(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length > 0 ? kept.join(" · ") : undefined;
}
