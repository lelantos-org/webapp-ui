import { useCallback, useState } from "react";

export interface Review {
  /// Showing the summary rather than the fields.
  open: boolean;
  /// Move to the summary. Call from the form's submit handler.
  enter(): void;
  /// Back to the fields, unchanged.
  cancel(): void;
}

/// The pause between filling a spend in and committing it.
///
/// A shielded transfer cannot be reversed, cannot be cancelled, and has no
/// recipient-side confirmation — a wrong address is simply gone. Every other
/// irreversible thing in this app gates itself too: the claim-link generator
/// behind a checkbox, the hard refresh behind an acknowledgement.
///
/// Kept as a hook rather than form state so the reset rules live in one place:
/// any edit to the form must drop the user back out of review, or they could
/// confirm figures they are no longer looking at.
///
/// `fingerprint` is whatever identifies the spend being reviewed — amount,
/// recipient, asset, fee asset. When it changes, review closes: the summary on
/// screen is no longer the thing that would be sent.
///
/// Closed during the render that sees the change, rather than in an effect
/// after it: an effect would let one commit paint the summary over figures it
/// was not opened for. Keyed on the change itself rather than on the fingerprint the
/// review was opened with, so an edit that returns to the reviewed values
/// (A → B → A, as `useFollowMax` can write) still leaves it closed.
export function useReview(fingerprint: string): Review {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(fingerprint);
  if (seen !== fingerprint) {
    setSeen(fingerprint);
    if (open) setOpen(false);
  }

  const enter = useCallback(() => setOpen(true), []);
  const cancel = useCallback(() => setOpen(false), []);

  return { open: open && seen === fingerprint, enter, cancel };
}
