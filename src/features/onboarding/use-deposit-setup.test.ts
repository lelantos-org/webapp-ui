import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDepositSetup } from "./use-deposit-setup";
import type { SetupStatus } from "./use-setup-status";

const WETH_ASSET = 1n;
const FAR_FUTURE = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

/// Permit2 state for a token with nothing approved — the ordinary state of a
/// wallet that has never deposited this ERC-20.
const NOTHING_APPROVED: SetupStatus = {
  erc20Allowance: 0n,
  window: { amount: 0n, expiration: FAR_FUTURE, nonce: 0 },
};

/// `useSetupStatus` is the only collaborator, and it is what holds the stale
/// cache entry this bug turned on. Stubbing it keeps the test on the gating
/// logic rather than on react-query's disabled-query semantics.
const status = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("./use-setup-status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-setup-status")>()),
  useSetupStatus: () => status.current,
}));

function setup(asEth: boolean, over: Record<string, unknown> = {}) {
  status.current = {
    data: NOTHING_APPROVED,
    isError: false,
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
    ...over,
  };
  return renderHook(() => useDepositSetup(WETH_ASSET, { asEth, total: 1_000n })).result.current;
}

describe("useDepositSetup", () => {
  it("blocks an ERC-20 deposit with nothing approved, and offers the fix", () => {
    const s = setup(false);
    expect(s.blocked).toBe(true);
    expect(s.applicable).toBe(true);
    expect(s.needs.needsSetup).toBe(true);
  });

  // The regression. "ETH (native)" reuses WETH's asset id, so the setup query
  // keeps serving WETH's allowance state from cache after `enabled` goes
  // false. Reading it blocked the deposit, and `applicable: false` hid the
  // notice that would have let the user clear it — no way forward at all.
  it("never blocks a native-ETH deposit on a stale WETH allowance", () => {
    const s = setup(true);
    expect(s.blocked).toBe(false);
    expect(s.applicable).toBe(false);
    expect(s.needs.needsSetup).toBe(false);
  });

  it("reports nothing outstanding for native ETH even while the probe errors", () => {
    const s = setup(true, { isError: true, data: undefined });
    expect(s.blocked).toBe(false);
    expect(s.unknown).toBe(false);
  });

  // An unreadable probe on the ERC-20 path still blocks: submitting could fail
  // in a way the gate exists to catch.
  it("blocks an ERC-20 deposit whose allowances cannot be read", () => {
    const s = setup(false, { isError: true, data: undefined });
    expect(s.blocked).toBe(true);
    expect(s.unknown).toBe(true);
  });
});
