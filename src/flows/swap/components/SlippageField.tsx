// Slippage entry for the swap form, inside the Details row.
//
// Owns a self-contained slice of policy: the presets and the word describing
// what each one risks, independent of quoting and submitting. What the chosen
// figure *means* is said once, under the Swap button (`revertFootnote`), rather
// than repeated here.

import { slippagePct } from "../swap-copy";
import "./SlippageField.css";

const SLIPPAGE_PRESETS_BPS = [10, 50, 100] as const;

interface SlippageFieldProps {
  bps: number;
  onChange(bps: number): void;
  error?: string | undefined;
}

const SLIP_META: Record<number, { tag: string; tone: "ok" | "warn" }> = {
  10: { tag: "Tight", tone: "ok" },
  50: { tag: "Default", tone: "ok" },
  100: { tag: "Loose", tone: "warn" },
};

export function SlippageField({ bps, onChange, error }: SlippageFieldProps) {
  return (
    <fieldset className="slip">
      <legend className="slip__lbl">Max slippage</legend>
      <div className="slip__opts">
        {SLIPPAGE_PRESETS_BPS.map((b) => {
          const m = SLIP_META[b];
          const on = bps === b;
          return (
            // Native radios: the browser supplies the arrow-key navigation and
            // roving focus an equivalent ARIA pattern would have to reimplement.
            // The input is visually hidden and the label carries the styling.
            <label
              key={b}
              className={`slip__opt ${on ? "slip__opt--on" : ""} ${m?.tone === "warn" ? "slip__opt--warn" : ""}`}
            >
              <input
                type="radio"
                name="slippage-preset"
                className="slip__radio"
                value={b}
                checked={on}
                onChange={() => onChange(b)}
              />
              <span className="slip__pct">{slippagePct(b)}</span>
              <span className="slip__sub">{m?.tag}</span>
            </label>
          );
        })}
      </div>
      {error ? <span className="slip__err">{error}</span> : null}
    </fieldset>
  );
}
