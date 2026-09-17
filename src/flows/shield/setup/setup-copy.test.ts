import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import {
  currentStepId,
  depositSetupCopy,
  initialProgress,
  joinNames,
  runningCopy,
  setupAllCopy,
  setupCostLine,
  setupSteps,
  uncheckedApprovalsLine,
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

describe("joinNames", () => {
  it("joins with commas and a final and", () => {
    expect(joinNames(["USDC"])).toBe("USDC");
    expect(joinNames(["USDC", "WBTC"])).toBe("USDC and WBTC");
    expect(joinNames(["USDC", "DAI", "WBTC"])).toBe("USDC, DAI and WBTC");
  });
});

describe("setupAllCopy", () => {
  it("matches shield.dc for two tokens while ETH is selected", () => {
    const c = setupAllCopy(["USDC", "WBTC"], { symbol: "ETH", native: true });
    expect(c.title).toBe("USDC and WBTC need one-time setup");
    expect(c.short).toBe("One-time setup for 2 tokens");
    expect(c.body).toMatch(/^Not needed for this deposit — ETH never requires it\. /);
    expect(c.body).toMatch(/shielding those two later/);
  });

  it("says an approved token is already set up, rather than that it never needs it", () => {
    expect(setupAllCopy(["WBTC"], { symbol: "USDC", native: false }).body).toMatch(
      /USDC is already set up/,
    );
  });

  it("makes no claim about the current deposit when it is not known", () => {
    const c = setupAllCopy(["USDC"], undefined);
    expect(c.title).toBe("USDC needs one-time setup");
    expect(c.body).not.toMatch(/this deposit/);
  });

  it("counts rather than lists past three", () => {
    expect(setupAllCopy(["A", "B", "C", "D"], undefined).title).toBe(
      "4 tokens need one-time setup",
    );
  });
});

describe("depositSetupCopy", () => {
  const known = { unknown: false, willApproveErc20: false };

  it("keeps the single-token wording", () => {
    expect(depositSetupCopy(["USDC"], { ...known, willApproveErc20: true })).toEqual({
      title: "USDC needs one-time setup",
      body: "Approve USDC once and authorize a spending window. Shielding USDC then takes a single confirmation in your wallet.",
    });
    expect(depositSetupCopy(["USDC"], { unknown: true, willApproveErc20: false }).title).toBe(
      "Couldn't check USDC's approval",
    );
  });

  it("names both tokens, and the relayer fee the second one covers", () => {
    const c = depositSetupCopy(["USDC", "DAI"], known);
    expect(c.title).toBe("USDC and DAI need one-time setup");
    expect(c.body).toBe(
      "Authorize new spending windows for USDC and DAI that cover this deposit and its relayer fee.",
    );
    expect(depositSetupCopy(["USDC", "DAI"], { unknown: true, willApproveErc20: false })).toEqual({
      title: uncheckedApprovalsLine(["USDC", "DAI"]),
      body: "The approval status for USDC and DAI couldn't be read. Running setup authorizes them either way.",
    });
    expect(uncheckedApprovalsLine(["USDC", "DAI"])).toBe(
      "Couldn't check approvals for USDC and DAI",
    );
  });
});
