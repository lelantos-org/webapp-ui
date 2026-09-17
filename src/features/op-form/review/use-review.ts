import { useCallback, useState } from "react";

/// The review step's state.
export interface Review {
  /// Showing the summary rather than the fields.
  open: boolean;
  /// Call from the form's submit handler.
  enter(): void;
  cancel(): void;
}

/// The pause before an irreversible spend; closes whenever `fingerprint` changes, even back to a reviewed value.
export function useReview(fingerprint: string): Review {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(fingerprint);
  // Closed during render, not in an effect, so no commit paints the summary over changed figures.
  if (seen !== fingerprint) {
    setSeen(fingerprint);
    if (open) setOpen(false);
  }

  const enter = useCallback(() => setOpen(true), []);
  const cancel = useCallback(() => setOpen(false), []);

  return { open: open && seen === fingerprint, enter, cancel };
}
