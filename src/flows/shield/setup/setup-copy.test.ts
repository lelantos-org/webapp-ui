import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import {
  currentStepId,
  initialProgress,
  runningCopy,
  setupCostLine,
  setupSteps,
} from "./setup-copy";

const AAA = makeAsset(1n, "AAA", { token: "0xAaAa000000000000000000000000000000000001" });
const BBB = makeAsset(2n, "BBB", { token: "0xbbbb000000000000000000000000000000000002" });

describe("setupCostLine", () => {
  it("counts the approvals that do not batch, then the two steps that do", () => {
    expect(setupCostLine(0)).toBe("1 signature, 1 transaction");
    expect(setupCostLine(1)).toBe("1 approval, 1 signature, 1 transaction");
    expect(setupCostLine(3)).toBe("3 approvals, 1 signature, 1 transaction");
  });
});

describe("setup steps", () => {
  it("draws one approval row per token, keyed so the highlight follows the token", () => {
    const steps = setupSteps([AAA, BBB]);
    expect(steps.map((s) => s.label)).toEqual([
      "authorize AAA",
      "authorize BBB",
      "sign allowances",
      "submit allowances on-chain",
    ]);
    // Mixed case in the progress event still lands on the row.
    expect(
      currentStepId({
        step: "approving",
        status: "wallet",
        token: makeAsset(9n, "AAA", { token: AAA.token.toUpperCase().replace("0X", "0x") }).token,
        index: 1,
        total: 2,
      }),
    ).toBe(steps[0]?.id);
    expect(currentStepId({ step: "signing", status: "wallet" })).toBe("signing");
  });

  it("starts on the first approval, or on the signature when there is none", () => {
    expect(initialProgress([AAA, BBB])).toMatchObject({ step: "approving", index: 1, total: 2 });
    expect(initialProgress([])).toEqual({ step: "signing", status: "wallet" });
  });
});

describe("runningCopy", () => {
  it("names the token and its place among several prompts", () => {
    expect(
      runningCopy(
        { step: "approving", status: "wallet", token: AAA.token, index: 2, total: 3 },
        () => "AAA",
      ),
    ).toBe("Approving AAA for Permit2 (2/3) — confirm in your wallet.");
  });
});
