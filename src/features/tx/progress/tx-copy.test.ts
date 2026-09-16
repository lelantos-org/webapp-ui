// The two sentences that make a promise about the user's money — whether the
// tab can be closed, and whether a failure cost anything — have to change with
// the stage the op reached. These pin the stages where the reassuring version
// would be false.

import { describe, expect, it } from "vitest";
import {
  failureReassurance,
  handedOff,
  retrySafe,
  settledNote,
  type TxStage,
  walkAwayNote,
} from "./tx-copy";
import { stepsFor, type TxPhase } from "./tx-progress";

const spend = (phase: TxPhase | undefined, hash = false): TxStage => ({
  steps: stepsFor("transfer"),
  phase,
  hash,
});
const deposit = (phase: TxPhase | undefined, needsApproval = false, hash = false): TxStage => ({
  steps: stepsFor("deposit", { needsApproval }),
  phase,
  hash,
});

describe("walkAwayNote", () => {
  it("keeps a spend's tab open until the relayer has it", () => {
    expect(walkAwayNote(spend("proving"))).toMatch(/Keep this tab open until the proof/);
    expect(walkAwayNote(spend("submitting"))).toMatch(/moment longer/);
    expect(walkAwayNote(spend("submitting", true))).toMatch(/won't stop it/);
  });

  it("lets a deposit go once the wallet has sent it, not before", () => {
    expect(walkAwayNote(deposit("signing"))).toMatch(/Keep this tab open until your wallet/);
    expect(walkAwayNote(deposit("submitting"))).toMatch(/Keep this tab open/);
    expect(walkAwayNote(deposit("broadcast"))).toMatch(/won't stop it/);
    expect(walkAwayNote(deposit("mined"))).toMatch(/won't stop it/);
  });

  it("never promises to notify anyone", () => {
    const all = [spend("proving"), spend("mined", true), deposit("mined")].map(walkAwayNote);
    for (const note of all) expect(note).not.toMatch(/tell you|notify|let you know/i);
  });
});

describe("failureReassurance", () => {
  it("says nothing was spent when a spend failed before the handoff", () => {
    expect(failureReassurance(spend(undefined))).toMatch(/nothing was sent/i);
    expect(failureReassurance(spend("proving"))).toMatch(/never left the pool/);
  });

  it("does not claim nothing was spent once a spend has a hash", () => {
    const line = String(failureReassurance(spend("submitting", true)));
    expect(line).not.toMatch(/nothing was|never left/i);
    expect(line).toMatch(/explorer/);
  });

  it("names the approval that did land on a deposit failing at the permit", () => {
    expect(String(failureReassurance(deposit("signing", true)))).toMatch(/approval did go through/);
    expect(String(failureReassurance(deposit("approving", true)))).not.toMatch(/did go through/);
  });

  it("never claims nothing was spent after a deposit broadcast", () => {
    for (const phase of ["broadcast", "mined"] as const) {
      const line = String(failureReassurance(deposit(phase)));
      expect(line).not.toMatch(/nothing was|no tokens/i);
      expect(line).toMatch(/second deposit/);
    }
  });
});

describe("retrySafe", () => {
  it("offers a retry only while nothing can be on-chain", () => {
    expect(retrySafe(spend("proving"))).toBe(true);
    expect(retrySafe(spend("submitting", true))).toBe(false);
    expect(retrySafe(deposit("submitting"))).toBe(true);
    expect(retrySafe(deposit("broadcast"))).toBe(false);
  });

  it("reads a deposit's broadcast from the steps even without a hash", () => {
    expect(handedOff(deposit("broadcast"))).toBe(true);
    expect(handedOff(spend("submitting"))).toBe(false);
  });
});

describe("settledNote", () => {
  it("admits an outcome that was never observed", () => {
    expect(settledNote("unknown")).toMatch(/explorer/);
    expect(settledNote("flushed")).toBeUndefined();
  });
});
