import { describe, expect, it } from "vitest";
import { UNLIMITED_ALLOWANCE } from "@/features/wallet";
import {
  evaluateSetup,
  evaluateSetupMany,
  NO_SETUP_NEEDS,
  type SetupStatus,
} from "./use-setup-status";

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
      // The allowance covers this deposit but sits below the cap a run grants,
      // so a run launched for another reason still approves it.
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
    // Returning all-zero allowances instead would read as nothing approved, so
    // the form would demand a setup flow that cannot succeed, fail, and demand
    // it again, leaving ERC-20 deposits unusable on that chain.
    expect(evaluateSetup(undefined, 1_000n)).toEqual(NO_SETUP_NEEDS);
  });

  it("still demands setup for a real all-zero reading", () => {
    const zeroed = { erc20Allowance: 0n, window: { amount: 0n, expiration: 0, nonce: 0 } };
    expect(evaluateSetup(zeroed, 1_000n).needsSetup).toBe(true);
  });
});

// A window sized as `depositTotal * 10n` at the moment setup ran would drain
// after roughly ten same-sized deposits, and a single larger deposit would outrun
// it, both re-opening the setup modal on an already-authorized token.
// `defaultAllowanceCap` returns `type(uint160).max`,
// which Permit2 reads as unlimited and never decrements.
describe("evaluateSetup with an unlimited window", () => {
  const unlimited = (expiration = FAR): SetupStatus => ({
    erc20Allowance: UNLIMITED_ALLOWANCE,
    window: { amount: UNLIMITED_ALLOWANCE, expiration, nonce: 0 },
  });

  it("covers any total, however large", () => {
    for (const total of [1n, 10n ** 30n, UNLIMITED_ALLOWANCE]) {
      expect(evaluateSetup(unlimited(), total, NOW)).toEqual(NO_SETUP_NEEDS);
    }
  });

  it("still expires — the cap is unbounded, the grant is not", () => {
    const needs = evaluateSetup(unlimited(NOW + 30), 1_000n, NOW);
    expect(needs.needsAllowancePermit).toBe(true);
    expect(needs.needsErc20Approve).toBe(false);
  });
});

describe("evaluateSetupMany", () => {
  it("evaluates each asset against its own total", () => {
    const statuses = new Map<bigint, SetupStatus | undefined>([
      [1n, state(10_000n, 10_000n)],
      [2n, state(10_000n, 500n)],
    ]);
    const totals = new Map<bigint, bigint | undefined>([
      [1n, 1_000n],
      [2n, 1_000n],
    ]);
    const out = evaluateSetupMany(statuses, totals, NOW);

    expect(out.get(1n)?.needsSetup).toBe(false);
    // Same total, smaller window — must not inherit asset 1's verdict.
    expect(out.get(2n)).toMatchObject({ needsAllowancePermit: true, needsErc20Approve: false });
  });

  // The multi-token modal has no amount typed, so this is the path it uses.
  it("falls back to an existence check when a total is missing", () => {
    const statuses = new Map<bigint, SetupStatus | undefined>([
      [1n, state(0n, 0n)],
      [2n, state(10_000n, 10_000n)],
    ]);
    const out = evaluateSetupMany(statuses, undefined, NOW);

    expect(out.get(1n)?.needsSetup).toBe(true);
    expect(out.get(2n)?.needsSetup).toBe(false);
  });

  it("passes an unanswerable probe straight through as nothing-to-do", () => {
    const out = evaluateSetupMany(new Map([[1n, undefined]]), undefined, NOW);
    expect(out.get(1n)).toEqual(NO_SETUP_NEEDS);
  });

  it("returns one entry per input asset", () => {
    const statuses = new Map<bigint, SetupStatus | undefined>([
      [1n, state(0n, 0n)],
      [2n, undefined],
      [3n, state(10_000n, 10_000n)],
    ]);
    expect([...evaluateSetupMany(statuses, undefined, NOW).keys()]).toEqual([1n, 2n, 3n]);
  });
});
