import type { ReactNode } from "react";

export interface StepperItem {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepperItem[];
  /// Id of the step currently in progress. Steps before it are `done`,
  /// after it are `pending`. Omitted when nothing has started yet.
  current?: string;
  /// Mark the current step as failed (renders `×`).
  failed?: boolean;
  /// Treat `current` as the last completed step rather than an in-flight
  /// one. Set after a terminal phase (settled/flushed).
  done?: boolean;
}

type StepState = "done" | "current" | "pending" | "failed";

const CLASSES: Record<StepState, string> = {
  done: "step step--done",
  current: "step step--current",
  pending: "step step--pending",
  failed: "step step--failed",
};

export function Stepper({ steps, current, failed = false, done = false }: StepperProps) {
  if (steps.length === 0) return null;
  const currentIdx = current ? steps.findIndex((s) => s.id === current) : -1;
  return (
    <ol className="stepper" aria-label="transaction progress">
      {steps.map((s, i) => {
        const state = stateAt(i, currentIdx, { failed, done });
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
  );
}

interface Flags {
  failed: boolean;
  done: boolean;
}

function stateAt(i: number, currentIdx: number, { failed, done }: Flags): StepState {
  if (currentIdx === -1) return "pending";
  if (i < currentIdx) return "done";
  if (i > currentIdx) return "pending";
  if (failed) return "failed";
  return done ? "done" : "current";
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
