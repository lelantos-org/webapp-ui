import type { ReactNode } from "react";
import "./Stepper.css";

export interface StepperItem {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepperItem[];
  /// Id of the step in progress: earlier steps are `done`, later ones `pending`.
  current?: string | undefined;
  /// Mark the current step as failed (renders `×`).
  failed?: boolean;
  /// Treat `current` as the last completed step, after a terminal phase.
  done?: boolean;
}

export type StepState = "done" | "current" | "pending" | "failed";

interface Flags {
  failed?: boolean;
  done?: boolean;
}

/// Each step's state around `currentIdx` (`-1` before any); a failure before any step marks the first.
export function stepStates(
  count: number,
  currentIdx: number,
  { failed = false, done = false }: Flags = {},
): StepState[] {
  return Array.from({ length: count }, (_, i) => {
    if (currentIdx === -1) return failed && i === 0 ? "failed" : "pending";
    if (i < currentIdx) return "done";
    if (i > currentIdx) return "pending";
    if (failed) return "failed";
    return done ? "done" : "current";
  });
}

const CLASSES: Record<StepState, string> = {
  done: "step step--done",
  current: "step step--current",
  pending: "step step--pending",
  failed: "step step--failed",
};

export function Stepper({ steps, current, failed = false, done = false }: StepperProps) {
  if (steps.length === 0) return null;
  const currentIdx = current ? steps.findIndex((s) => s.id === current) : -1;
  const states = stepStates(steps.length, currentIdx, { failed, done });
  return (
    <>
      <ol className="inset stepper" aria-label="Transaction progress">
        {steps.map((s, i) => {
          const state = states[i] ?? "pending";
          return (
            <li key={s.id} className={CLASSES[state]}>
              <span className="step__mark" aria-hidden>
                {markFor(state, i)}
              </span>
              <span className="step__label">{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {announce(steps, currentIdx, states)}
      </p>
    </>
  );
}

function announce(steps: StepperItem[], currentIdx: number, states: StepState[]): string {
  const idx = currentIdx === -1 ? (states[0] === "failed" ? 0 : -1) : currentIdx;
  const step = idx === -1 ? undefined : steps[idx];
  if (!step) return "";
  const position = `Step ${idx + 1} of ${steps.length}`;
  switch (states[idx]) {
    case "failed":
      return `${position} failed: ${step.label}`;
    case "done":
      return `${position} complete: ${step.label}`;
    default:
      return `${position}: ${step.label}`;
  }
}

function markFor(state: StepState, idx: number): ReactNode {
  switch (state) {
    case "done":
      return "✓";
    case "failed":
      return "×";
    case "current":
      return <span className="spinner" />;
    case "pending":
      return idx + 1;
  }
}
