import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";

export interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (ids: { inputId: string; descId?: string }) => ReactNode;
}

/// Field wrapper with label, optional inline action (right-aligned hint), and
/// error text. Provides ids for `aria-describedby` wiring so screen readers
/// associate the error with its input.
export function Field({ label, error, hint, children }: FieldProps) {
  const inputId = useId();
  const descId = error ? `${inputId}-err` : undefined;
  return (
    <div className="fld">
      <div className="fld__row">
        <label className="fld__lbl" htmlFor={inputId}>
          {label}
        </label>
        {hint ? <span className="fld__hint">{hint}</span> : null}
      </div>
      {children({ inputId, descId })}
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
      {({ inputId, descId }) =>
        trailing ? (
          <div className="fld__inp-wrap">
            <input
              {...inputProps}
              ref={ref}
              id={inputId}
              aria-describedby={descId}
              className="fld__inp"
            />
            <div className="fld__trailing">{trailing}</div>
          </div>
        ) : (
          <input
            {...inputProps}
            ref={ref}
            id={inputId}
            aria-describedby={descId}
            className="fld__inp"
          />
        )
      }
    </Field>
  );
});
