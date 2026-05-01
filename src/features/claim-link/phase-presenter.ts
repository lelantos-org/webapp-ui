// Pure presentation helpers derived from the claim-flow Phase.

import type { Phase } from "@/features/claim-link/phase-machine";
import type { StepperItem } from "@/shared/ui/Stepper";

export const CLAIM_STEPS: StepperItem[] = [
  { id: "link", label: "decode link" },
  { id: "connect", label: "connect wallet" },
  { id: "scan", label: "scan for note" },
  { id: "claim", label: "claim" },
];

export interface StepperState {
  current?: string;
  failed: boolean;
  done: boolean;
}

export function stepperStateFor(phase: Phase): StepperState {
  switch (phase.kind) {
    case "reading-fragment":
      return { current: "link", failed: false, done: false };
    case "bad-link":
      return { current: "link", failed: true, done: false };
    case "need-wallet":
      return { current: "connect", failed: false, done: false };
    case "loading":
      return { current: "scan", failed: false, done: false };
    case "ready":
    case "sweeping":
      return { current: "claim", failed: false, done: false };
    case "done":
      return { current: "claim", failed: false, done: true };
    case "error":
      return { current: "claim", failed: true, done: false };
  }
}

export function heroSubtitleFor(phase: Phase): string | undefined {
  switch (phase.kind) {
    case "reading-fragment":
      return "reading the bearer secret from the URL fragment.";
    case "bad-link":
      return "this link can't be parsed.";
    case "need-wallet":
      return "connect a wallet to derive the destination shielded address.";
    case "loading":
      return "scanning the chain for the deposited note.";
    case "ready":
      return "review claimable balances and sweep to your shielded address.";
    case "sweeping":
      return "submitting claim transaction.";
    case "done":
      return "funds swept to your shielded address.";
    case "error":
      return undefined;
  }
}
