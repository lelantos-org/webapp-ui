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
  /// Shape check for this form's address flavour — `isEvmAddress` for a
  /// withdraw, `isShieldedAddress` for a transfer. The schema's own predicate,
  /// not a looser one: `formError` is empty until the first submit, so a
  /// prefix test ticks the field green on a half-typed address the form will
  /// then reject.
  isValid(value: string): boolean;
  /// Write a pasted address into the field. Omit to withhold the paste button.
  onPaste?(text: string): void;
  formError?: string;
}

/// Shared recipient input for Transfer (shielded bech32) and Withdraw
/// (Ethereum 0x). The address *rule* is caller-owned since each form has its
/// own; everything downstream of it lives here.
///
/// Nobody types an address. It is pasted — and on a phone, long-pressing a
/// text input for the paste callout is the fiddliest gesture in the flow, on
/// the field where a mistake sends funds to a stranger. The trailing slot is
/// free until the address validates, so the button costs no layout.
export function RecipientField({
  inputProps,
  label,
  placeholder,
  value,
  isValid,
  onPaste,
  formError,
}: RecipientFieldProps) {
  // No "has the user typed anything" guard: `isValid` already implies it, since
  // an empty field cannot pass. A `dirtyFields` check also goes false when the
  // post-submit reset clears the amount while keeping the recipient, dropping
  // the marker off an address that is still perfectly valid.
  const valid = !formError && isValid(value);
  // Firefox implements no `readText` at all, and Safari gates it behind a
  // per-paste user prompt. Absent the API the button is simply not offered —
  // the field is a plain input and the platform's own paste still works.
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
/// A denied permission prompt and a clipboard holding no text both reject or
/// come back empty; neither is worth more than the toast, and the user can
/// still paste by hand.
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
