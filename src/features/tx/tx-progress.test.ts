// The step list is a promise about wallet prompts: one step per prompt the user
// should expect, in order, and a terminal phase that closes the stepper only once
// the op is actually over.

import { describe, expect, it } from "vitest";
import type { OpKind } from "@/shared/domain/op-kind";
import { isDepositSteps, isTerminal, stepsFor, terminalOf } from "./tx-progress";

const ids = (kind: OpKind, opts?: Parameters<typeof stepsFor>[1]) =>
  stepsFor(kind, opts).map((s) => s.id);

describe("stepsFor", () => {
  it("gives every spend the same four steps, ending at inclusion", () => {
    for (const kind of ["transfer", "withdraw", "withdrawEth", "swap"] as const) {
      expect(ids(kind)).toEqual(["preparing", "proving", "submitting", "mined"]);
    }
  });

  it("asks a witness-path deposit for a signature, and an approval only when needed", () => {
    expect(ids("deposit")).toEqual(["signing", "submitting", "broadcast", "mined"]);
    expect(ids("deposit", { needsApproval: true })).toEqual([
      "approving",
      "signing",
      "submitting",
      "broadcast",
      "mined",
    ]);
  });

  // Neither path has a per-deposit prompt before the send: native ETH is one
  // payable tx, and an AllowanceTransfer window already covers the pull.
  it("drops the approval and the signature on the native and allowance paths", () => {
    const tail = ["submitting", "broadcast", "mined"];
    expect(ids("deposit", { asEth: true, needsApproval: true })).toEqual(tail);
    expect(ids("deposit", { allowanceTransfer: true, needsApproval: true })).toEqual(tail);
  });

  it("words `submitting` for who sends the tx", () => {
    const submit = (kind: OpKind) => stepsFor(kind).find((s) => s.id === "submitting");
    expect(submit("deposit")?.label).toBe("Confirm in your wallet");
    expect(submit("transfer")?.label).toBe("Hand to the relayer");
  });

  it("carries copy for every step it lists", () => {
    const all = [...stepsFor("transfer"), ...stepsFor("deposit", { needsApproval: true })];
    for (const step of all) {
      expect(step.label).not.toBe(step.id);
      expect(step.activeLabel).toBeDefined();
      expect(step.doneLabel).toBeDefined();
    }
  });
});

describe("isDepositSteps", () => {
  it("recognises a deposit by its broadcast step", () => {
    expect(isDepositSteps(stepsFor("deposit", { asEth: true }))).toBe(true);
    expect(isDepositSteps(stepsFor("withdraw"))).toBe(false);
    expect(isDepositSteps([])).toBe(false);
  });
});

describe("terminalOf", () => {
  // A deposit's last step stays current until the relayer flushes it.
  it("closes a deposit on the flush and every spend on inclusion", () => {
    for (const opts of [
      {},
      { asEth: true },
      { allowanceTransfer: true },
      { needsApproval: true },
    ]) {
      expect(terminalOf(stepsFor("deposit", opts))).toBe("flushed");
    }
    for (const kind of ["transfer", "withdraw", "withdrawEth", "swap"] as const) {
      expect(terminalOf(stepsFor(kind))).toBe("mined");
    }
    expect(terminalOf([])).toBeUndefined();
  });
});

describe("isTerminal", () => {
  it("stops the stepper on an outcome, known or not", () => {
    for (const phase of ["flushed", "settled", "failed", "unknown"] as const) {
      expect(isTerminal(phase)).toBe(true);
    }
  });

  // `mined` closes a spend's card through `terminalOf`, not here: on a deposit
  // it is the wait for the relayer.
  it("keeps every in-flight phase running", () => {
    for (const phase of [
      "wrapping",
      "approving",
      "signing",
      "preparing",
      "proving",
      "submitting",
      "broadcast",
      "mined",
    ] as const) {
      expect(isTerminal(phase)).toBe(false);
    }
    expect(isTerminal(undefined)).toBe(false);
  });
});
