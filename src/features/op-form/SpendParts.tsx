// Small pieces Send and Unshield draw identically.

import type { ReactNode } from "react";
import { type FeeSummaryModel, feeLine } from "@/features/fees";
import { formatAssetFixed } from "@/shared/lib/format/asset";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import type { AssetMeta } from "./amount-validation";
import type { Review } from "./use-spend-form";

/// The balance on `AmountHero`'s right: "8,420.00 USDC", and "8,420.00" on
/// phones, where the pill beside it already states the symbol.
export function SpendBalance({
  value,
  meta,
  symbol,
}: {
  /// Circuit units, as the shielded balance is held.
  value: bigint;
  meta: AssetMeta;
  symbol: string;
}) {
  const figure = formatAssetFixed(value, meta, 6);
  return (
    <>
      {figure}
      {symbol ? <span className="only-wide"> {symbol}</span> : null}
    </>
  );
}

/// The Details row's summary in both lengths — "Total fees 0.25 USDC · paid in
/// USDC" and, on phones, "Fees 0.25 USDC · in USDC" — switched by CSS rather than
/// a media-query hook, so the first render is already the right one.
export function SpendFeeSummary({ model }: { model: FeeSummaryModel | undefined }) {
  return (
    <>
      <span className="only-wide">{feeLine(model)}</span>
      <span className="only-narrow">{feeLine(model, { short: true })}</span>
    </>
  );
}

/// The header over a spend with a review step: the form's own, or the review's.
interface SpendScreenHeaderProps {
  review: Review;
  /// The route in one line, under "Review": "Shielded pool → shielded address ·
  /// stays off-chain".
  reviewSubtitle: string;
  /// The form's header, shown while the fields are.
  children: ReactNode;
}

/// Swapped rather than stacked: the review takes the form's place, and its
/// back button returns to the fields it summarised.
export function SpendScreenHeader({ review, reviewSubtitle, children }: SpendScreenHeaderProps) {
  if (!review.open) return <>{children}</>;
  return (
    <ScreenHeader
      title="Review"
      subtitle={reviewSubtitle}
      right="STEP 2 OF 2"
      onBack={review.cancel}
      backLabel="Back to the form"
    />
  );
}
