import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "@/shared/lib/logger";
import { toast } from "@/shared/lib/toast";

const log = createLogger("copy");

/// How long the inline "copied" confirmation stays up.
const FEEDBACK_MS = 1500;

export interface CopyHandle {
  /// Write `value` to the clipboard. Never rejects.
  copy(): Promise<void>;
  /// True for `FEEDBACK_MS` after a successful copy.
  copied: boolean;
}

/// Clipboard write with a self-clearing "copied" flag.
///
/// Four components had grown their own version of this, and they had drifted:
/// two left the reset timer running after unmount, none cancelled a previous
/// timer, so copying twice in quick succession let the first copy's expiry cut
/// the second confirmation short. `navigator.clipboard` is also absent outside
/// a secure context and rejects when the document is not focused, so the
/// failure path is not hypothetical.
export function useCopy(value: string): CopyHandle {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
    } catch (e) {
      log.warn("clipboard write failed", e);
      setCopied(false);
    }
  }, [value]);

  return { copy, copied };
}

/// Clipboard write that reports through a toast instead of inline state.
///
/// For the copy affordances that have no room for a "copied" label — an icon
/// button, a one-line row. Same failure handling as `useCopy`; the split is
/// only about where the confirmation goes.
export async function copyWithToast(value: string, confirmation: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(confirmation);
  } catch (e) {
    log.warn("clipboard write failed", e);
    toast.error("clipboard unavailable");
  }
}
