import { cx } from "@/shared/lib/cx";
import {
  type DenominationOption,
  LADDER_FIELD_LABEL,
  LADDER_HEADING,
  type LadderModel,
} from "./ladder";
import "./DenominationField.css";

export interface DenominationFieldProps {
  model: LadderModel;
  onPick(option: DenominationOption): void;
}

/// Advisory chips of shared withdrawal amounts, with a verdict on the entered one.
export function DenominationField({ model, onPick }: DenominationFieldProps) {
  const { options, notice } = model;
  if (!notice) return null;

  return (
    <div className="den">
      <div className="den__hdr">
        <span className="den__t">{LADDER_HEADING}</span>
        {/* Announced: changes only when the amount crosses on or off the ladder. */}
        {notice.tag ? (
          <span
            className={cx(
              "badge",
              notice.tone === "ok" ? "badge--accent" : "badge--warn",
              "den__tag",
            )}
            role="status"
          >
            {notice.tag}
          </span>
        ) : null}
      </div>

      {options.length > 0 ? (
        <fieldset className="den__opts" aria-label={LADDER_FIELD_LABEL}>
          {options.map((o) => (
            <button
              key={o.value.toString()}
              type="button"
              className={cx("den__opt", o.state !== "plain" && `den__opt--${o.state}`)}
              aria-pressed={o.state === "chosen"}
              onClick={() => onPick(o)}
            >
              {o.label}
            </button>
          ))}
        </fieldset>
      ) : null}

      <span className="den__hint">{notice.text}</span>
    </div>
  );
}
