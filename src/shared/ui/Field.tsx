import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";

export interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (ids: { inputId: string; descId?: string; invalid: boolean }) => ReactNode;
}

/// Field wrapper with label, optional inline action (right-aligned hint), and
/// error text. Provides ids for `aria-describedby` wiring so screen readers
/// associate the error with its input.
///
/// `invalid` rides along with the ids rather than being applied here, because
/// the control itself is the render prop's to draw — some callers hand-roll a
/// `<select>`. Passing it through the same channel is what keeps a field from
/// describing an error it never marks.
export function Field({ label, error, hint, children }: FieldProps) {
  const inputId = useId();
  const descId = error ? `${inputId}-err` : undefined;
  const invalid = !!error;
  return (
    <div className="fld">
      <div className="fld__row">
        <label className="fld__lbl" htmlFor={inputId}>
          {label}
        </label>
        {hint ? <span className="fld__hint">{hint}</span> : null}
      </div>
      {children({ inputId, descId, invalid })}
      {error ? (
        <span className="err txt-xs" id={descId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  /// Optional content rendered after the input (e.g. validity check, MAX button).
  trailing?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, trailing, ...inputProps },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint}>
      {({ inputId, descId, invalid }) => {
        // `|| undefined` rather than the boolean: an explicit `aria-invalid="false"`
        // on every clean field is noise in the accessibility tree, where absence
        // already means valid.
        const state = {
          "aria-describedby": descId,
          "aria-invalid": invalid || undefined,
          "aria-required": inputProps.required || undefined,
        };
        return trailing ? (
          <div className="fld__inp-wrap">
            <input {...inputProps} {...state} ref={ref} id={inputId} className="fld__inp" />
            <div className="fld__trailing">{trailing}</div>
          </div>
        ) : (
          <input {...inputProps} {...state} ref={ref} id={inputId} className="fld__inp" />
        );
      }}
    </Field>
  );
});
