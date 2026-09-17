import type { ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { ArcGlyph, CheckGlyph, CrossGlyph, InfoGlyph } from "@/shared/ui/icons/glyphs";
import { type StepState, stepStates } from "@/shared/ui/Stepper";
import "./txcard.css";

export interface TxProgressStep {
  id: string;
  /// The step before it starts: "Build the zero-knowledge proof".
  label: string;
  /// While it runs: "Building the zero-knowledge proof". Falls back to `label`.
  activeLabel?: string | undefined;
  /// Once done: "Built the zero-knowledge proof". Falls back to `label`.
  doneLabel?: string | undefined;
  /// Shown under the label while this step is current.
  detail?: ReactNode;
}

export interface TxProgressCardProps {
  /// "Proving your transfer".
  title: string;
  /// "250 USDC · about 20 seconds left".
  subtitle?: ReactNode;
  steps: readonly TxProgressStep[];
  /// Id of the step in progress. Steps before it are done, after it pending.
  current?: string | undefined;
  /// Every step is done.
  done?: boolean;
  /// The walk-away note under the steps. Omit rather than promise something the op cannot keep.
  note?: ReactNode;
  /// A trailing control, such as a link home once the proof is handed off.
  action?: ReactNode;
}

/// The label for a step in `state`: the plan, the activity, or the result.
function labelFor(s: TxProgressStep, state: StepState): string {
  if (state === "current") return s.activeLabel ?? s.label;
  if (state === "done") return s.doneLabel ?? s.label;
  return s.label;
}

/// Bar progress: half a step into the current one, so it moves as a step starts.
function fraction(count: number, currentIdx: number, done: boolean): number {
  if (count === 0) return 0;
  if (done) return 1;
  if (currentIdx === -1) return 0.04;
  return Math.min(1, (currentIdx + 0.5) / count);
}

/// The card shown in place of an action's fields while its transaction is in flight.
export function TxProgressCard({
  title,
  subtitle,
  steps,
  current,
  done = false,
  note,
  action,
}: TxProgressCardProps) {
  const currentIdx = current ? steps.findIndex((s) => s.id === current) : -1;
  const pct = Math.round(fraction(steps.length, currentIdx, done) * 100);
  const states = done ? steps.map((): StepState => "done") : stepStates(steps.length, currentIdx);
  const active = currentIdx === -1 ? undefined : steps[currentIdx];
  const activeText = active ? labelFor(active, states[currentIdx] ?? "current") : undefined;

  return (
    <section className="surface surface--card txcard" aria-label={title}>
      <div className="txcard__head">
        <span className="txcard__tile" aria-hidden="true">
          <ArcGlyph size={22} className="txcard__spin" />
        </span>
        <div className="txcard__heading">
          <span className="txcard__t">{title}</span>
          {subtitle ? <span className="txcard__sub">{subtitle}</span> : null}
        </div>
      </div>

      <div
        className="txcard__bar"
        role="progressbar"
        aria-label="progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span className="txcard__fill" style={{ width: `${pct}%` }} />
      </div>

      {steps.length > 0 ? (
        <ol className="txsteps" aria-label="Transaction progress">
          {steps.map((s, i) => {
            const state = states[i] ?? "pending";
            return (
              <li key={s.id} className={cx("txstep", `txstep--${state}`)}>
                <span className="txstep__mark" aria-hidden="true">
                  {state === "done" ? (
                    <CheckGlyph size={13} strokeWidth={3} />
                  ) : state === "failed" ? (
                    <CrossGlyph size={12} />
                  ) : state === "current" ? (
                    <span className="txstep__dot" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="txstep__text">
                  <span className="txstep__label">{labelFor(s, state)}</span>
                  {state === "current" && s.detail ? (
                    <span className="txstep__detail">{s.detail}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {active ? `Step ${currentIdx + 1} of ${steps.length}: ${activeText}` : ""}
      </p>

      {note || action ? (
        <>
          <div className="rule" />
          <div className="txcard__foot">
            {note ? (
              <div className="txcard__note">
                <InfoGlyph size={17} className="txcard__note-icon" />
                <span>{note}</span>
              </div>
            ) : null}
            {action}
          </div>
        </>
      ) : null}
    </section>
  );
}
