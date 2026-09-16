import { describe, expect, it } from "vitest";
import { isPresentable, keywordAdvice } from "./keyword-advice";

describe("keywordAdvice", () => {
  it("names a slippage revert rather than a bare revert", () => {
    // Below the slippage rule, "revert" would word this as a generic on-chain
    // failure and hide that a fresh quote fixes it.
    expect(keywordAdvice("execution reverted: min out not met")).toMatch(/slippage limit/);
  });

  it("reads an expired permit as an expired quote, not a missing approval", () => {
    expect(keywordAdvice("permit expired")).toMatch(/Quote expired/);
  });

  it("words a wallet that does not know the chain", () => {
    expect(keywordAdvice('Unrecognized chain ID "0x7a69".')).toMatch(/does not have this network/);
  });

  it("leaves SDK wording to the codes", () => {
    // These were matched on text before the SDK carried a code for each; a rule
    // left behind would shadow the curated line if the code path ever missed.
    expect(keywordAdvice("relayer rejected the submission: fee-too-low")).toBeUndefined();
    expect(
      keywordAdvice("not enough spendable notes right now (2 awaiting an earlier spend)"),
    ).toBeUndefined();
  });
});

describe("isPresentable", () => {
  it("withholds hex payloads and multi-line messages", () => {
    expect(isPresentable("call to 0x1e4fbdf7abcdef reverted")).toBe(false);
    expect(isPresentable("line one\nline two")).toBe(false);
    expect(isPresentable('Chain "0x7a69" is not available.')).toBe(true);
  });
});
