// Slippage entry for the swap form.
//
// Owns a self-contained slice of policy: the presets and the wording describing
// what each one risks, independent of quoting and submitting.

const SLIPPAGE_PRESETS_BPS = [10, 50, 100] as const;

interface SlippageFieldProps {
  bps: number;
  onChange(bps: number): void;
  error?: string;
}

const SLIP_META: Record<number, { tag: string; tone: "ok" | "warn" }> = {
  10: { tag: "Tight", tone: "ok" },
  50: { tag: "Default", tone: "ok" },
  100: { tag: "Loose", tone: "warn" },
};

export function SlippageField({ bps, onChange, error }: SlippageFieldProps) {
  const meta = SLIP_META[bps];
  return (
    <div className="fld slip">
      <div className="slip__hdr">
        <span className="fld__lbl">Max slippage</span>
        <span className={`slip__tag slip__tag--${meta?.tone ?? "ok"}`}>
          {meta?.tag ?? `${(bps / 100).toFixed(2)}%`}
        </span>
      </div>
      <div className="slip__opts" role="radiogroup" aria-label="slippage tolerance">
        {SLIPPAGE_PRESETS_BPS.map((b) => {
          const m = SLIP_META[b];
          const on = bps === b;
          return (
            // Native radios: the browser supplies the arrow-key navigation and
            // roving focus an equivalent ARIA pattern would have to reimplement.
            // The input is visually hidden and the label carries the styling.
            <label key={b} className={`slip__opt ${on ? "slip__opt--on" : ""}`}>
              <input
                type="radio"
                name="slippage-preset"
                className="slip__radio"
                value={b}
                checked={on}
                onChange={() => onChange(b)}
              />
              <span className="slip__pct">{(b / 100).toFixed(b < 100 ? 2 : 1)}%</span>
              <span className="slip__sub">{m?.tag}</span>
            </label>
          );
        })}
      </div>
      <span className="slip__hint muted txt-xs">
        Trade reverts if price moves more than {(bps / 100).toFixed(2)}% before execution.
      </span>
      {error ? <span className="err txt-xs">{error}</span> : null}
    </div>
  );
}
