import { describe, expect, it } from "vitest";
import { evaluateDepositSetup, evaluateSetup, NO_SETUP_NEEDS } from "./evaluate-setup";
import { ALLOWANCE_CAP, type Permit2AllowanceState } from "./permit2-setup";

const NOW = 1_700_000_000;
const FAR = NOW + 30 * 24 * 3600;

const state = (
  erc20Allowance: bigint,
  amount: bigint,
  expiration = FAR,
): Permit2AllowanceState => ({
  erc20Allowance,
  window: { amount, expiration, nonce: 0 },
});

describe("evaluateSetup", () => {
  it("needs nothing when both allowances cover the total exactly", () => {
    expect(evaluateSetup(state(1_000n, 1_000n), 1_000n, NOW)).toEqual({
      needsErc20Approve: false,
      willApproveErc20: true,
      needsAllowancePermit: false,
      needsSetup: false,
    });
  });

  it("needs everything on a token that has never been approved", () => {
    const needs = evaluateSetup(state(0n, 0n), 1_000n, NOW);
    expect(needs).toMatchObject({ needsErc20Approve: true, needsAllowancePermit: true });
    expect(needs.needsSetup).toBe(true);
  });

  it("flags a window that exists but cannot cover the total", () => {
    const needs = evaluateSetup(state(10_000n, 999n), 1_000n, NOW);
    expect(needs.needsErc20Approve).toBe(false);
    expect(needs.needsAllowancePermit).toBe(true);
    expect(needs.needsSetup).toBe(true);
  });

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
    expect(evaluateSetup(undefined, 1_000n)).toEqual(NO_SETUP_NEEDS);
  });

  it("still demands setup for a real all-zero reading", () => {
    const zeroed = { erc20Allowance: 0n, window: { amount: 0n, expiration: 0, nonce: 0 } };
    expect(evaluateSetup(zeroed, 1_000n).needsSetup).toBe(true);
  });
});

describe("evaluateSetup with an unlimited window", () => {
  const unlimited = (expiration = FAR): Permit2AllowanceState => ({
    erc20Allowance: ALLOWANCE_CAP,
    window: { amount: ALLOWANCE_CAP, expiration, nonce: 0 },
  });

  it("covers any total, however large", () => {
    for (const total of [1n, 10n ** 30n, ALLOWANCE_CAP]) {
      expect(evaluateSetup(unlimited(), total, NOW)).toEqual(NO_SETUP_NEEDS);
    }
  });

  it("still expires — the cap is unbounded, the grant is not", () => {
    const needs = evaluateSetup(unlimited(NOW + 30), 1_000n, NOW);
    expect(needs.needsAllowancePermit).toBe(true);
    expect(needs.needsErc20Approve).toBe(false);
  });
});

describe("evaluateDepositSetup", () => {
  const covered = state(ALLOWANCE_CAP, ALLOWANCE_CAP);

  it("needs setup while the fee token is uncovered, though the deposit token is", () => {
    const { needs, perToken } = evaluateDepositSetup(
      [
        { status: covered, total: 1_000n },
        { status: state(0n, 0n), total: 42n },
      ],
      NOW,
    );
    expect(needs.needsSetup).toBe(true);
    expect(perToken.map((n) => n.needsSetup)).toEqual([false, true]);
  });

  it("sizes the fee token's window against the relayer fee, not the principal", () => {
    const { needs } = evaluateDepositSetup(
      [
        { status: covered, total: 1_000n },
        { status: state(42n, 42n), total: 42n },
      ],
      NOW,
    );
    expect(needs.needsSetup).toBe(false);
  });

  it("needs nothing when every token is covered", () => {
    expect(
      evaluateDepositSetup(
        [
          { status: covered, total: 1_000n },
          { status: covered, total: 42n },
        ],
        NOW,
      ).needs,
    ).toEqual(NO_SETUP_NEEDS);
  });
});
