import type { UseFormRegisterReturn } from "react-hook-form";
import { TextField } from "@/shared/ui/Field";

export interface RecipientFieldProps {
  inputProps: UseFormRegisterReturn;
  label: string;
  placeholder: string;
  /// Caller-computed validity. When `true` the field renders a ✓ glyph in
  /// the trailing slot. Typically `!error && dirty && regexMatches`.
  valid: boolean;
  formError?: string;
}

/// Shared recipient input for Transfer (shielded bech32) and Withdraw
/// (Ethereum 0x). Format check is caller-owned so each form keeps its own
/// regex; this component is layout only.
export function RecipientField({
  inputProps,
  label,
  placeholder,
  valid,
  formError,
}: RecipientFieldProps) {
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
        ) : null
      }
      {...inputProps}
    />
  );
}
