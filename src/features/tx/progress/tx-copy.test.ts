import { describe, expect, it } from "vitest";
import {
  failureReassurance,
  handedOff,
  retrySafe,
  settledCopy,
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

  it("does not say nothing was spent once the funds were being merged", () => {
    const merging: TxStage = {
      steps: [
        ...stepsFor("transfer").slice(0, 1),
        { id: "consolidating" },
        ...stepsFor("transfer").slice(1),
      ],
      phase: "proving",
      hash: false,
    };
    expect(walkAwayNote(merging)).toMatch(/merge of your funds, and its fee, may already/);
    expect(walkAwayNote(merging)).not.toMatch(/nothing is spent/);
    expect(failureReassurance(merging)).toMatch(/merging them may have gone through/);
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

  it("warns against a second send when the relayer never said whether it took the spend", () => {
    const line = failureReassurance({ ...spend("submitting"), outcomeUnknown: true });
    expect(line).not.toMatch(/safe|nothing was|never left/i);
    expect(line).toMatch(/pay twice/);
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
    expect(retrySafe({ ...spend("submitting"), outcomeUnknown: true })).toBe(false);
  });

  it("reads a deposit's broadcast from the steps even without a hash", () => {
    expect(handedOff(deposit("broadcast"))).toBe(true);
    expect(handedOff(spend("submitting"))).toBe(false);
  });
});

describe("settledCopy", () => {
  const DEPOSIT = stepsFor("deposit", { needsApproval: false });

  it("keeps the op's own title and adds nothing once the outcome was observed", () => {
    expect(settledCopy("flushed", DEPOSIT, "Shielded")).toEqual({
      title: "Shielded",
      unconfirmed: false,
      note: undefined,
    });
  });

  it("admits an outcome that was never observed", () => {
    const copy = settledCopy("unknown", stepsFor("transfer"), "Sent privately");
    expect(copy).toMatchObject({ title: "Sent, not confirmed yet", unconfirmed: true });
    expect(copy.note).toMatch(/explorer/);
  });

  it("does not call an unflushed deposit shielded", () => {
    const copy = settledCopy("unknown", DEPOSIT, "Shielded");
    expect(copy.title).not.toBe("Shielded");
    expect(copy.note).toMatch(/had not added it to the pool/);
  });
});
