// Pure presentation helpers derived from the claim-flow Phase.

import { type StepState, stepStates } from "@/shared/ui/Stepper";
import type { Phase } from "./phase-machine";

/// The three claim steps: the link, the wallet, the claim.
///
/// Not the pipeline's five. "Network" and "scan for note" are real stops but not
/// decisions the recipient makes: a wrong network holds
/// the flow at "Connect" with its own card saying why, and the scan is the first
/// half of claiming. A stranger holding a link needs to know how far along they
/// are, not the pipeline's stages.
export interface ClaimStep {
  id: ClaimStepId;
  /// While pending or in progress: "Connect".
  label: string;
  /// Once passed: "Wallet connected".
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
/// nothing can be spent until the wallet moves, so the stepper holds at
/// "Connect" — the wallet is connected, but not yet where it needs to be.
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
    // Finding the note is the first half of claiming it.
    case "loading":
    case "ready":
    case "sweeping":
      return { current: "claim", failed: false, done: false };
    case "done":
      return { current: "claim", failed: false, done: true };
    case "error":
      // A failed scan and a failed sweep both stop at "Claim". The error card
      // says which, and whether anything moved; the stepper only says where.
      return { current: "claim", failed: true, done: false };
  }
}

/// Each step's state, in `CLAIM_STEPS` order, for the row stepper.
///
/// `done` completes the current step as well as those before it: a settled
/// claim is not still "in progress" at its last step.
export function claimStepStates({ current, failed, done }: StepperState): StepState[] {
  const at = CLAIM_STEPS.findIndex((s) => s.id === current);
  return stepStates(CLAIM_STEPS.length, at, { failed, done });
}

/// Written for someone who has never used this app and is holding a link to
/// real money. That rules out naming the mechanism — "bearer secret", "URL
/// fragment", "commitment tree" — however precise it is: a stranger cannot act
/// on any of it, and being told a term they do not know while they wait for
/// funds reads as something having gone wrong.
///
/// `undefined` means the hero's default line. `blocked` yields to it: the network
/// gate card already names both chains and offers the switch, and repeating that
/// here would read as two separate problems.
export function heroSubtitleFor(phase: Phase, blocked = false): string | undefined {
  if (blocked && phase.kind !== "done" && phase.kind !== "error") return undefined;
  switch (phase.kind) {
    case "reading-fragment":
      return "Reading your claim link.";
    case "bad-link":
      // A reload is the common route to this state, and nothing has failed.
      return phase.reason === "missing"
        ? "The claim code is only ever in the address bar, and only for a moment."
        : "This link can't be parsed.";
    case "loading":
      return "Looking for your funds.";
    case "sweeping":
      return "Claiming — this can take a moment.";
    case "done":
      return "Done — the funds are yours.";
    // The hero's own line — what is here and where it goes — is the right one
    // while the recipient is deciding, and while an error card speaks for itself.
    case "need-wallet":
    case "ready":
    case "error":
      return undefined;
  }
}
