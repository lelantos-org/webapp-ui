// The privacy-preserving amounts a withdrawal can use, and how the entered one
// compares.
//
// The ladder is derived from the asset's own `scale` and `decimals`, so every
// wallet holding it publishes the same rungs. Never a locally generated ladder:
// one no other wallet shares cannot claim a crowd. Every user-visible string
// that could be read as a promise about the anonymity set — the heading, the
// badge, the hint, the fieldset's accessible name — comes from `ladder.ts`, so a
// future source lands in one place rather than here.
//
// Chips rather than a `<select>`: the whole point is that the set is small,
// shared and worth reading at a glance, and a collapsed control hides it.
//
// Advisory throughout. Picking a denomination is a click, never a requirement,
// and an off-ladder amount is warned about rather than blocked — the submit
// button is not this control's to disable. See `ladder.ts`.

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

export function DenominationField({ model, onPick }: DenominationFieldProps) {
  const { options, notice } = model;
  // No notice means no ladder, which also means no options: the asset has
  // nothing to conform to, so the control does not exist rather than rendering
  // empty.
  if (!notice) return null;

  return (
    <div className="den">
      <div className="den__hdr">
        <span className="den__t">{LADDER_HEADING}</span>
        {/* The one part worth announcing. The line below carries the entered
            figure and so changes on every keystroke; this changes only when the
            amount crosses on or off the ladder, which is the event. */}
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
        // A fieldset rather than a div with `role="group"`: the chips are one
        // choice made of several controls, which is what the element means.
        // `DenominationField.css` strips the UA border and the `min-content` floor
        // that would stop the row wrapping.
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

      {/* Withheld on phones: the badge carries
          the verdict there, and the review states it again in full. */}
      <span className="den__hint">{notice.text}</span>
    </div>
  );
}
