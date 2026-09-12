import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cx } from "@/shared/lib/cx";
import { createLogger } from "@/shared/lib/logger";
import { toast } from "@/shared/lib/toast";
import { CheckGlyph } from "@/shared/ui/glyphs";
import { grouped } from "./ReviewPanel";
import "./RecipientField.css";

const log = createLogger("forms:recipient");

export interface RecipientFieldProps {
  inputProps: UseFormRegisterReturn;
  /// "To", "To public address".
  label: string;
  placeholder: string;
  /// The field's live value, watched by the caller. The check mark, the paste
  /// button and the grouped display are all derived from it.
  value: string;
  /// Shape check for this form's address type: `isEvmAddress` for a withdraw,
  /// `isShieldedAddress` for a transfer. Pass the schema's own predicate rather
  /// than a looser one — `formError` is empty until the first submit, so a prefix
  /// test would mark a half-typed address valid.
  isValid(value: string): boolean;
  /// Shown once the user has left a non-empty field that fails `isValid`:
  /// "That is not a shielded address". The same sentence the blocked submit
  /// gives, so the two places never word one problem differently.
  invalidMessage: string;
  /// Write an address into the field — the paste button's read, or a paste
  /// cleaned of whitespace. Omit to withhold the paste button.
  onPaste?(text: string): void;
  formError?: string | undefined;
  /// The quiet line under the field: "A shielded address. Ask the recipient for
  /// theirs — it never appears on-chain." Withheld on phones.
  helper?: ReactNode;
  /// Under the helper and kept on phones: Send's "No shielded address? Send by
  /// link →".
  extra?: ReactNode;
}

/// The recipient of a spend: a shielded bech32 address for Send, a public 0x one
/// for Unshield. Each form owns its address rule; everything downstream of it
/// lives here.
///
/// A textarea rather than an input. A shielded address is 164 characters, and a
/// single-line field shows a sliver of it — the part a swapped address is least
/// likely to differ in. It grows to fit, is set in the mono face, and refuses a
/// newline: Enter submits, as it would from an input.
///
/// Invalid is shown after the user leaves the field, not while they type — a
/// half-pasted address is not yet an error — and never before they have typed
/// anything. On phones a valid address is shown grouped in fours until the field
/// is focused again; the textarea stays on top, transparent,
/// so a tap still lands in it.
export function RecipientField({
  inputProps,
  label,
  placeholder,
  value,
  isValid,
  invalidMessage,
  onPaste,
  formError,
  helper,
  extra,
}: RecipientFieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const helpId = `${id}-help`;
  const area = useRef<HTMLTextAreaElement | null>(null);
  const [left, setLeft] = useState(false);

  // No dirty-field guard: `isValid` implies one, since an empty field cannot
  // pass. A `dirtyFields` check would also go false when the post-submit reset
  // clears the amount while keeping the recipient, dropping the marker from a
  // still-valid address.
  const valid = !formError && isValid(value);
  const error =
    formError ?? (left && value.trim() !== "" && !isValid(value) ? invalidMessage : undefined);

  // Firefox implements no `readText`, and Safari gates it behind a per-paste
  // prompt. Without the API the button is not offered; the field remains a plain
  // input and the platform paste still works.
  const canPaste = !!onPaste && typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  // Grow to the content. A custom property rather than `style.height`, so the
  // phone overlay state can size the textarea to the grouped text instead —
  // an inline height would beat any stylesheet rule. `field-sizing: content`
  // does this natively where supported; this is the fallback.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is the trigger — the height is read off the DOM, which changes with it.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.removeProperty("--rcpt-h");
    el.style.setProperty("--rcpt-h", `${el.scrollHeight}px`);
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };

  // Addresses copied out of chats and PDFs arrive wrapped or padded. Whitespace
  // is never part of either address format, so it is dropped from the paste
  // rather than left for the validator to reject.
  const onPasteText = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    if (!onPaste || !/\s/.test(text)) return;
    e.preventDefault();
    const el = e.currentTarget;
    const cleaned = text.replace(/\s+/g, "");
    onPaste(el.value.slice(0, el.selectionStart) + cleaned + el.value.slice(el.selectionEnd));
  };

  const describedBy = cx(error && errId, helper ? helpId : undefined);

  return (
    <div className={cx("rcpt", valid && "rcpt--valid", !!error && "rcpt--invalid")}>
      <label className="rcpt__lbl" htmlFor={id}>
        {label}
      </label>
      <div className="rcpt__box">
        <div className="rcpt__field">
          {valid ? (
            <div className="rcpt__grouped mono" aria-hidden="true">
              {grouped(value)}
            </div>
          ) : null}
          <textarea
            {...inputProps}
            ref={(el) => {
              inputProps.ref(el);
              area.current = el;
            }}
            id={id}
            className="rcpt__inp mono"
            rows={1}
            placeholder={placeholder}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onKeyDown={onKeyDown}
            onPaste={onPasteText}
            onBlur={(e) => {
              setLeft(true);
              return inputProps.onBlur(e);
            }}
          />
        </div>
        {valid ? (
          <span className="rcpt__ok" role="img" aria-label="valid address">
            <CheckGlyph size={13} />
          </span>
        ) : value === "" && canPaste ? (
          <button
            type="button"
            className="rcpt__paste"
            onClick={() => void pasteInto(onPaste)}
            aria-label={`Paste ${label.toLowerCase()} address`}
          >
            Paste
          </button>
        ) : null}
      </div>
      {error ? (
        <span className="rcpt__err" id={errId}>
          {error}
        </span>
      ) : null}
      {helper ? (
        <span className="rcpt__helper" id={helpId}>
          {helper}
        </span>
      ) : null}
      {extra}
    </div>
  );
}

/// Read the clipboard into the field. Never throws.
///
/// A denied permission prompt and an empty clipboard both reject or return
/// nothing. Neither warrants more than a toast, and the platform paste remains
/// available.
async function pasteInto(write: (text: string) => void): Promise<void> {
  try {
    const text = (await navigator.clipboard.readText()).replace(/\s+/g, "");
    if (!text) {
      toast.info("Clipboard is empty");
      return;
    }
    write(text);
  } catch (e) {
    log.warn("clipboard read failed", e);
    toast.error("Clipboard unavailable");
  }
}
