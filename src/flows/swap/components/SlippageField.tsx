import { cx } from "@/shared/lib/cx";
import { slippagePct } from "../swap-copy";
import "./SlippageField.css";

interface SlippageFieldProps {
  bps: number;
  onChange(bps: number): void;
  error?: string | undefined;
}

const SLIPPAGE_PRESETS: readonly { bps: number; tag: string; tone: "ok" | "warn" }[] = [
  { bps: 10, tag: "Tight", tone: "ok" },
  { bps: 50, tag: "Default", tone: "ok" },
  { bps: 100, tag: "Loose", tone: "warn" },
];

/// Slippage presets, inside the swap's Details row.
export function SlippageField({ bps, onChange, error }: SlippageFieldProps) {
  return (
    <fieldset className="slip">
      <legend className="slip__lbl">Max slippage</legend>
      <div className="slip__opts">
        {SLIPPAGE_PRESETS.map(({ bps: b, tag, tone }) => {
          const on = bps === b;
          return (
            <label
              key={b}
              className={cx(
                "slip__opt",
                on && "slip__opt--on",
                tone === "warn" && "slip__opt--warn",
              )}
            >
              <input
                type="radio"
                name="slippage-preset"
                className="slip__radio input-hidden"
                value={b}
                checked={on}
                onChange={() => onChange(b)}
              />
              <span className="slip__pct">{slippagePct(b)}</span>
              <span className="slip__sub">{tag}</span>
            </label>
          );
        })}
      </div>
      {error ? <span className="slip__err">{error}</span> : null}
    </fieldset>
  );
}
