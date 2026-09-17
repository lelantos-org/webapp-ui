import { type StepState, stepStates } from "@/shared/ui/Stepper";
import type { Phase } from "./phase-machine";

/// One of the three user-facing claim steps: the link, the wallet, the claim.
export interface ClaimStep {
  id: ClaimStepId;
  label: string;
  doneLabel: string;
}

type ClaimStepId = "link" | "connect" | "claim";

export const CLAIM_STEPS: readonly ClaimStep[] = [
  { id: "link", label: "Read link", doneLabel: "Link read" },
  { id: "connect", label: "Connect", doneLabel: "Wallet connected" },
  { id: "claim", label: "Claim", doneLabel: "Claimed" },
];

export interface StepperState {
  current: ClaimStepId;
  failed: boolean;
  done: boolean;
}

/// The chain the link names, for the phases that know it.
export function linkChainIdOf(phase: Phase): bigint | undefined {
  switch (phase.kind) {
    case "need-wallet":
    case "loading":
    case "ready":
    case "sweeping":
    case "done":
    case "error":
      return phase.chainId;
    case "reading-fragment":
    case "bad-link":
      return undefined;
  }
}

/// Stepper position for a phase; `blocked` (wallet on the wrong chain) holds it at "Connect".
export function stepperStateFor(phase: Phase, blocked = false): StepperState {
  if (blocked && phase.kind !== "done" && phase.kind !== "error") {
    return { current: "connect", failed: false, done: false };
  }
  switch (phase.kind) {
    case "reading-fragment":
      return { current: "link", failed: false, done: false };
    case "bad-link":
      return { current: "link", failed: true, done: false };
    case "need-wallet":
      return { current: "connect", failed: false, done: false };
    case "loading":
    case "ready":
    case "sweeping":
      return { current: "claim", failed: false, done: false };
    case "done":
      return { current: "claim", failed: false, done: true };
    case "error":
      return { current: "claim", failed: true, done: false };
  }
}

/// Each step's state, in `CLAIM_STEPS` order; `done` completes the current step too.
export function claimStepStates({ current, failed, done }: StepperState): StepState[] {
  const at = CLAIM_STEPS.findIndex((s) => s.id === current);
  return stepStates(CLAIM_STEPS.length, at, { failed, done });
}

/// Hero subtitle for a phase, in plain words; `undefined` means the hero's default line.
export function heroSubtitleFor(phase: Phase, blocked = false): string | undefined {
  if (blocked && phase.kind !== "done" && phase.kind !== "error") return undefined;
  switch (phase.kind) {
    case "reading-fragment":
      return "Reading your claim link.";
    case "bad-link":
      return phase.reason === "missing"
        ? "The claim code is only ever in the address bar, and only for a moment."
        : "This link can't be parsed.";
    case "loading":
      return "Looking for your funds.";
    case "sweeping":
      return "Claiming — this can take a moment.";
    case "done":
      return "Done — the funds are yours.";
    case "need-wallet":
    case "ready":
    case "error":
      return undefined;
  }
}
