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
import { grouped } from "@/shared/lib/address";
import { cx } from "@/shared/lib/cx";
import { createLogger } from "@/shared/lib/logger";
import { toast } from "@/shared/lib/toast";
import { CheckGlyph } from "@/shared/ui/icons/glyphs";
import type { RecipientRule } from "../schemas";
import "./RecipientField.css";

const log = createLogger("forms:recipient");

export interface RecipientFieldProps {
  inputProps: UseFormRegisterReturn;
  label: string;
  placeholder: string;
  value: string;
  /// Must be the schema's rule; a looser one marks a half-typed address valid. Its problem is
  /// shown once the user leaves a non-empty field that has one.
  rule: RecipientRule;
  /// Writes an address into the field; omit to withhold the paste button.
  onPaste?(text: string): void;
  formError?: string | undefined;
  /// Line under the field; hidden on phones.
  helper?: ReactNode;
  /// Under the helper, kept on phones.
  extra?: ReactNode;
}

/// A spend's recipient address in an auto-growing textarea, marked invalid only after the user leaves it.
export function RecipientField({
  inputProps,
  label,
  placeholder,
  value,
  rule,
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

  const problem = rule.problem(value);
  const valid = !formError && problem === undefined;
  const error = formError ?? (left && value.trim() !== "" ? problem : undefined);

  const canPaste = !!onPaste && typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

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
            enterKeyHint="go"
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

/// Reads the clipboard into the field, toasting instead of throwing.
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
