// Pure presentation helpers derived from the claim-flow Phase.

import type { Phase } from "@/features/claim-link/phase-machine";
import type { StepperItem } from "@/shared/ui/Stepper";

export const CLAIM_STEPS: StepperItem[] = [
  { id: "link", label: "decode link" },
  { id: "connect", label: "connect wallet" },
  { id: "network", label: "match network" },
  { id: "scan", label: "scan for note" },
  { id: "claim", label: "claim" },
];

export interface StepperState {
  current?: string;
  failed: boolean;
  done: boolean;
}

/// The chain the link names, for the phases that still know it.
///
/// `undefined` before the fragment is decoded and after the claim settles —
/// `done` deliberately drops it, since nothing further is chain-scoped. An
/// exhaustive switch rather than an `in` check so adding a phase is a compile
/// error here instead of a silently-unlabelled asset list.
export function linkChainIdOf(phase: Phase): bigint | undefined {
  switch (phase.kind) {
    case "need-wallet":
    case "loading":
    case "ready":
    case "sweeping":
      return phase.chainId;
    case "reading-fragment":
    case "bad-link":
    case "done":
    case "error":
      return undefined;
  }
}

/// `blocked` is the wallet being on a chain other than the link's.
///
/// It outranks the phase because the flow genuinely stops there: nothing is
/// scanned and nothing can be spent until the wallet moves, so showing "scan
/// for note" in progress would describe work that is not happening.
export function stepperStateFor(phase: Phase, blocked = false): StepperState {
  if (blocked && phase.kind !== "done" && phase.kind !== "error") {
    return { current: "network", failed: false, done: false };
  }
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

export function heroSubtitleFor(phase: Phase, blocked = false): string | undefined {
  if (blocked && phase.kind !== "done" && phase.kind !== "error") {
    return "switch your wallet to the link's network to continue.";
  }
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
