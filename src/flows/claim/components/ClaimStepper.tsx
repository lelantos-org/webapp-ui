// The claim page's row stepper: three numbered marks joined by a line, done in the
// accent, the current one outlined.
//
// Not the shared `Stepper`, which is a vertical list of an op's phases. This one
// is a wayfinding strip for a stranger, and its steps are fixed.

import { CheckGlyph, CrossGlyph } from "@/shared/ui/icons/glyphs";
import type { StepState } from "@/shared/ui/Stepper";
import { CLAIM_STEPS, claimStepStates, type StepperState } from "../phase-presenter";
import "./ClaimStepper.css";

function announce(states: StepState[]): string {
  const i = states.findIndex((s) => s === "current" || s === "failed");
  const step = CLAIM_STEPS[i];
  if (!step) return states.every((s) => s === "done") ? "All steps complete" : "";
  const where = `Step ${i + 1} of ${CLAIM_STEPS.length}: ${step.label}`;
  return states[i] === "failed" ? `${where} — stopped` : where;
}

export function ClaimStepper({ state }: { state: StepperState }) {
  const states = claimStepStates(state);
  return (
    <>
      <ol className="claim-steps" aria-hidden="true">
        {CLAIM_STEPS.map((step, i) => {
          const s = states[i] ?? "pending";
          return (
            <li key={step.id} className={`claim-step claim-step--${s}`}>
              <span className="claim-step__mark">
                {s === "done" ? (
                  <CheckGlyph size={14} strokeWidth={3} />
                ) : s === "failed" ? (
                  <CrossGlyph size={13} />
                ) : (
                  i + 1
                )}
              </span>
              <span className="claim-step__lbl">{s === "done" ? step.doneLabel : step.label}</span>
            </li>
          );
        })}
      </ol>
      {/* The strip is a picture; this is the sentence it draws. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announce(states)}
      </p>
    </>
  );
}
