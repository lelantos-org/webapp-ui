// Pure presentation helpers derived from the claim-flow Phase.

import type { StepperItem } from "@/shared/ui/Stepper";
import type { Phase } from "./phase-machine";

export const CLAIM_STEPS: StepperItem[] = [
  { id: "link", label: "decode link" },
  { id: "connect", label: "connect wallet" },
  { id: "network", label: "network" },
  { id: "scan", label: "scan for note" },
  { id: "claim", label: "claim" },
];

export interface StepperState {
  current?: string;
  failed: boolean;
  done: boolean;
}

/// The chain the link names, for the phases that know it.
///
/// `undefined` only before the fragment is decoded, or when decoding failed.
/// `done` and `error` retain it: the asset symbol and decimals come from that
/// chain's token list, so dropping it would leave the success card showing raw
/// circuit units and an `asset#<id>` label. An exhaustive switch rather than an
/// `in` check, so adding a phase is a compile error here.
export function linkChainIdOf(phase: Phase): bigint | undefined {
  switch (phase.kind) {
    case "need-wallet":
    case "loading":
    case "ready":
    case "sweeping":
    case "done":
      return phase.chainId;
    case "error":
      return phase.chainId;
    case "reading-fragment":
    case "bad-link":
      return undefined;
  }
}

/// `blocked` is the wallet being on a chain other than the link's.
///
/// It outranks the phase because the flow stops there: nothing is scanned and
/// nothing can be spent until the wallet moves, so showing "scan for note" in
/// progress would describe work that is not running.
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
      // A failed scan never reached the claim step, so marking that step failed
      // would imply a spend was attempted.
      return { current: phase.from === "scan" ? "scan" : "claim", failed: true, done: false };
  }
}

/// `blocked` drops the phase's own line rather than replacing it: the network
/// gate card already names both chains and offers the switch, and repeating that
/// here would read as two separate problems.
export function heroSubtitleFor(phase: Phase, blocked = false): string | undefined {
  if (blocked && phase.kind !== "done" && phase.kind !== "error") return undefined;
  switch (phase.kind) {
    case "reading-fragment":
      return "reading the bearer secret from the URL fragment.";
    case "bad-link":
      // A reload is the common route to this state, and nothing has failed.
      return phase.reason === "missing"
        ? "the secret is only ever in the address bar, and only for a moment."
        : "this link can't be parsed.";
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
