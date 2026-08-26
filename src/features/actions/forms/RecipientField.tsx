import type { UseFormRegisterReturn } from "react-hook-form";
import { createLogger } from "@/shared/lib/logger";
import { toast } from "@/shared/lib/toast";
import { TextField } from "@/shared/ui/Field";

const log = createLogger("forms:recipient");

export interface RecipientFieldProps {
  inputProps: UseFormRegisterReturn;
  label: string;
  placeholder: string;
  /// The field's live value, watched by the caller. Both the ✓ marker and the
  /// paste button are derived from it.
  value: string;
  /// Shape check for this form's address type: `isEvmAddress` for a withdraw,
  /// `isShieldedAddress` for a transfer. Pass the schema's own predicate rather
  /// than a looser one — `formError` is empty until the first submit, so a prefix
  /// test would mark a half-typed address valid.
  isValid(value: string): boolean;
  /// Write a pasted address into the field. Omit to withhold the paste button.
  onPaste?(text: string): void;
  formError?: string;
}

/// Shared recipient input for Transfer (shielded bech32) and Withdraw (Ethereum
/// 0x). Each form owns its address rule; everything downstream of it lives here.
///
/// Addresses are pasted rather than typed, and the platform paste gesture is
/// awkward on mobile, on the field where a mistake misdirects funds. The
/// trailing slot is free until the address validates, so the paste button costs
/// no layout.
export function RecipientField({
  inputProps,
  label,
  placeholder,
  value,
  isValid,
  onPaste,
  formError,
}: RecipientFieldProps) {
  // No dirty-field guard: `isValid` implies one, since an empty field cannot
  // pass. A `dirtyFields` check would also go false when the post-submit reset
  // clears the amount while keeping the recipient, dropping the marker from a
  // still-valid address.
  const valid = !formError && isValid(value);
  // Firefox implements no `readText`, and Safari gates it behind a per-paste
  // prompt. Without the API the button is not offered; the field remains a plain
  // input and the platform paste still works.
  const canPaste = !!onPaste && typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  return (
    <TextField
      label={label}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      error={formError}
      trailing={
        valid ? (
          <span className="fld__ok" aria-hidden>
            ✓
          </span>
        ) : value === "" && canPaste ? (
          <button
            type="button"
            className="lnk lnk--inline"
            onClick={() => void pasteInto(onPaste)}
            aria-label={`paste ${label}`}
          >
            paste
          </button>
        ) : null
      }
      {...inputProps}
    />
  );
}

/// Read the clipboard into the field. Never throws.
///
/// A denied permission prompt and an empty clipboard both reject or return
/// nothing. Neither warrants more than a toast, and the platform paste remains
/// available.
async function pasteInto(write: (text: string) => void): Promise<void> {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) {
      toast.info("clipboard is empty");
      return;
    }
    write(text);
  } catch (e) {
    log.warn("clipboard read failed", e);
    toast.error("clipboard unavailable");
  }
}
