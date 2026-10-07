import { useId } from "react";
import { Link } from "react-router-dom";
import { profilePath } from "@/features/names";
import { cx } from "@/shared/lib/cx";
import type { HandleStatus } from "../handle-status";

export interface HandleFieldProps {
  value: string;
  onChange(value: string): void;
  status: HandleStatus;
  /// An example of a shown handle, for the helper line.
  example: string;
  onRetryCheck(): void;
}

/// The handle input, with what the registrar says of the label under it.
export function HandleField({ value, onChange, status, example, onRetryCheck }: HandleFieldProps) {
  const id = useId();
  const statusId = `${id}-status`;
  const helpId = `${id}-help`;
  const bad = status.kind === "invalid" || status.kind === "taken";

  return (
    <div className="name-field">
      <label className="name-field__lbl" htmlFor={id}>
        Handle
      </label>
      <input
        id={id}
        className="text-input mono"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="mehow"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-invalid={bad ? true : undefined}
        aria-describedby={cx(statusId, helpId)}
      />
      <span
        className={cx(
          "name-field__status",
          bad && "name-field__status--err",
          status.kind === "available" && "name-field__status--ok",
        )}
        id={statusId}
        role="status"
      >
        <StatusLine status={status} onRetryCheck={onRetryCheck} />
      </span>
      <span className="name-field__helper" id={helpId}>
        Shown as {example}. Lowercase letters, digits and single hyphens, 3 to 32 characters.
      </span>
    </div>
  );
}

function StatusLine({ status, onRetryCheck }: Pick<HandleFieldProps, "status" | "onRetryCheck">) {
  switch (status.kind) {
    case "empty":
      return null;
    case "invalid":
      return <>{status.problem}</>;
    case "checking":
      return <>Checking {status.handle.name}…</>;
    case "available":
      return <>{status.handle.name} is available</>;
    case "taken":
      return (
        <>
          {status.handle.name} is taken.{" "}
          <Link to={profilePath(status.handle.label)} className="name-field__link">
            See who holds it →
          </Link>
        </>
      );
    case "check-failed":
      return (
        <>
          Couldn't check whether {status.handle.name} is free.{" "}
          <button type="button" className="link-btn name-field__retry" onClick={onRetryCheck}>
            Try again
          </button>
        </>
      );
  }
}
