import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "@/shared/lib/logger";
import { toast } from "@/shared/lib/toast";

const log = createLogger("copy");

const FEEDBACK_MS = 1500;

export interface CopyHandle {
  /// Write `value` to the clipboard. Never rejects.
  copy(): Promise<void>;
  /// True for `FEEDBACK_MS` after a successful copy.
  copied: boolean;
}

/// Clipboard write with a self-clearing "copied" flag.
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

/// Clipboard write that confirms through a toast instead of inline state.
export async function copyWithToast(value: string, confirmation: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(confirmation);
  } catch (e) {
    log.warn("clipboard write failed", e);
    toast.error("clipboard unavailable");
  }
}
