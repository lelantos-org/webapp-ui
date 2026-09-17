import type { ReactNode } from "react";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import type { Review } from "./use-review";

interface SpendScreenHeaderProps {
  review: Review;
  /// The route in one line, under "Review".
  reviewSubtitle: string;
  children: ReactNode;
}

/// A spend's header: the form's own, or the review's in its place.
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
