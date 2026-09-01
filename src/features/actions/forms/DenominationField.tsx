// The privacy-preserving amounts a withdrawal can use, and how the entered one
// compares.
//
// One flavour since SDK 0.32.0: the ladder is derived from the asset's own
// `scale` and `decimals`, so every wallet holding it publishes the same rungs.
// There was a second — a locally generated fallback for assets the old
// six-entry table omitted, which could not claim a crowd. Every user-visible
// string that could be read as a promise about the anonymity set — the heading,
// the badge, the hint, the fieldset's accessible name — still comes from the
// model already phrased for `model.source`, so a future source lands in one
// place rather than here.
//
// Chips rather than a `<select>`: the whole point is that the set is small,
// shared and worth reading at a glance, and a collapsed control hides it.
//
// Advisory throughout. Picking a denomination is a click, never a requirement,
// and an off-ladder amount is warned about rather than blocked — the submit
// button is not this control's to disable. See `ladder.ts`.

import { cx } from "@/shared/lib/cx";
import type { DenominationOption, LadderModel } from "./ladder";

export interface DenominationFieldProps {
  model: LadderModel;
  onPick(option: DenominationOption): void;
}

export function DenominationField({ model, onPick }: DenominationFieldProps) {
  const { options, notice, heading, fieldLabel } = model;
  // No notice means no ladder, which also means no options: the asset has
  // nothing to conform to, so the control does not exist rather than rendering
  // empty.
  if (!notice) return null;

  return (
    <div className="fld den">
      <div className="den__hdr">
        <span className="fld__lbl">{heading}</span>
        {/* The one part worth announcing. The line below carries the entered
            figure and so changes on every keystroke; this changes only when the
            amount crosses on or off the ladder, which is the event. */}
        {notice.tag ? (
          <span className={`tag tag--${notice.tone}`} role="status">
            {notice.tag}
          </span>
        ) : null}
      </div>

      {options.length > 0 ? (
        // A fieldset rather than a div with `role="group"`: the chips are one
        // choice made of several controls, which is what the element means.
        // `denominations.css` strips the UA border and the `min-content` floor
        // that would stop the row wrapping.
        <fieldset className="den__opts" aria-label={fieldLabel}>
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

      <span className="den__hint muted txt-xs">{notice.text}</span>
    </div>
  );
}
