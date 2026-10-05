import { MEMO_BYTES } from "@lelantos-org/sdk/primitives";
import { type ReactNode, useId } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { memoByteLength, memoProblem } from "@/shared/domain/memo";
import { cx } from "@/shared/lib/cx";
import "./MemoField.css";

export interface MemoFieldProps {
  inputProps: UseFormRegisterReturn;
  label: string;
  value: string;
  /// Line under the field: who reads the memo.
  helper: ReactNode;
}

/// A payment's memo: free text, counted against the bytes the note has room for.
export function MemoField({ inputProps, label, value, helper }: MemoFieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const helpId = `${id}-help`;
  const problem = memoProblem(value);

  return (
    <div className="memo">
      <div className="memo__head">
        <label className="memo__lbl" htmlFor={id}>
          {label}
        </label>
        <span className={cx("memo__count", !!problem && "memo__count--over")}>
          {memoByteLength(value)} / {MEMO_BYTES} bytes
        </span>
      </div>
      <textarea
        {...inputProps}
        id={id}
        className="text-input memo__inp"
        rows={2}
        autoComplete="off"
        aria-invalid={problem ? true : undefined}
        aria-describedby={cx(problem && errId, helpId)}
      />
      {problem ? (
        <span className="memo__err" id={errId}>
          {problem}
        </span>
      ) : null}
      <span className="memo__helper" id={helpId}>
        {helper}
      </span>
    </div>
  );
}
