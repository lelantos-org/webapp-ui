import { describe, expect, it } from "vitest";
import { evaluateSetup, NO_SETUP_NEEDS, type SetupStatus } from "./use-setup-status";

const NOW = 1_700_000_000;
const FAR = NOW + 30 * 24 * 3600;

const state = (erc20Allowance: bigint, amount: bigint, expiration = FAR): SetupStatus => ({
  erc20Allowance,
  window: { amount, expiration, nonce: 0 },
});

describe("evaluateSetup", () => {
  it("needs nothing when both allowances cover the total", () => {
    expect(evaluateSetup(state(1_000n, 1_000n), 1_000n, NOW)).toEqual({
      needsErc20Approve: false,
      needsAllowancePermit: false,
      needsSetup: false,
    });
  });

  it("needs everything on a token that has never been approved", () => {
    const needs = evaluateSetup(state(0n, 0n), 1_000n, NOW);
    expect(needs).toMatchObject({ needsErc20Approve: true, needsAllowancePermit: true });
    expect(needs.needsSetup).toBe(true);
  });

  // The SDK compares both allowances against the full total, so a window that
  // merely exists is not enough — it would fall back to the witness path.
  it("flags a window that exists but cannot cover the total", () => {
    const needs = evaluateSetup(state(10_000n, 999n), 1_000n, NOW);
    expect(needs.needsErc20Approve).toBe(false);
    expect(needs.needsAllowancePermit).toBe(true);
    expect(needs.needsSetup).toBe(true);
  });

  // A signed window is worthless if Permit2 cannot pull the ERC-20.
  it("flags an ERC-20 allowance that cannot cover the total", () => {
    const needs = evaluateSetup(state(999n, 10_000n), 1_000n, NOW);
    expect(needs.needsErc20Approve).toBe(true);
    expect(needs.needsAllowancePermit).toBe(false);
    expect(needs.needsSetup).toBe(true);
  });

  it("treats a window expiring inside the safety buffer as unusable", () => {
    expect(evaluateSetup(state(10_000n, 10_000n, NOW + 30), 1_000n, NOW).needsAllowancePermit).toBe(
      true,
    );
    expect(
      evaluateSetup(state(10_000n, 10_000n, NOW + 600), 1_000n, NOW).needsAllowancePermit,
    ).toBe(false);
  });

  it("accepts an allowance exactly equal to the total", () => {
    expect(evaluateSetup(state(1_000n, 1_000n), 1_000n, NOW).needsSetup).toBe(false);
  });

  it("reports no needs while the probe is unresolved", () => {
    expect(evaluateSetup(undefined, 1_000n, NOW).needsSetup).toBe(false);
  });

  // Before an amount is typed there is no total to compare against, but a
  // token with nothing approved needs setup regardless of the eventual amount.
  // Without this the form shows no prompt until the fee preview resolves.
  it("flags an entirely unapproved token before an amount is entered", () => {
    const needs = evaluateSetup(state(0n, 0n), undefined, NOW);
    expect(needs).toMatchObject({ needsErc20Approve: true, needsAllowancePermit: true });
    expect(needs.needsSetup).toBe(true);
  });

  it("stays quiet before an amount when an allowance already exists", () => {
    expect(evaluateSetup(state(10_000n, 10_000n), undefined, NOW).needsSetup).toBe(false);
  });
});

describe("evaluateSetup on a chain that cannot answer", () => {
  it("asks for no setup when the probe returned nothing", () => {
    // `readPermit2AllowanceState` returns `undefined` when the chain has no
    // AllowanceTransfer support or the registry row omits `permit2Address`. It
    // used to return all-zero allowances instead, which read as "nothing is
    // approved" — so the form demanded a setup flow that could not possibly
    // succeed, failed, and demanded it again. ERC-20 deposits were unusable on
    // that chain, and the screen blamed a missing approval.
    expect(evaluateSetup(undefined, 1_000n)).toEqual(NO_SETUP_NEEDS);
  });

  it("still demands setup for a real all-zero reading", () => {
    const zeroed = { erc20Allowance: 0n, window: { amount: 0n, expiration: 0, nonce: 0 } };
    expect(evaluateSetup(zeroed, 1_000n).needsSetup).toBe(true);
  });
});
