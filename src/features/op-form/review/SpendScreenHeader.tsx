import type { ReactNode } from "react";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import type { Review } from "./use-review";

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
