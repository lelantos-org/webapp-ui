// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asBaseUnits } from "@/shared/domain/units";
import { makeAsset } from "@/test/fixtures/assets";
import { ALLOWANCE_CAP, type Permit2AllowanceState } from "./setup/permit2-setup";
import { useDepositSetup } from "./use-deposit-setup";

/// The record the form holds; only `token` is read, via `useSetupStatus`, which
/// this file stubs out — the rest is shape.
const WETH_ASSET = makeAsset(1n, "WETH");
/// A second token, paying the relayer.
const DAI_ASSET = makeAsset(2n, "DAI");
/// The clock every case runs at; the window below is dated from it.
const NOW = Date.UTC(2026, 0, 1);
const FAR_FUTURE = Math.floor(NOW / 1000) + 30 * 24 * 3600;

/// Permit2 state for a token with nothing approved — the ordinary state of a
/// wallet that has never deposited this ERC-20.
const NOTHING_APPROVED: Permit2AllowanceState = {
  erc20Allowance: 0n,
  window: { amount: 0n, expiration: FAR_FUTURE, nonce: 0 },
};

/// Both allowances covering any amount, for a token set up already.
const COVERED: Permit2AllowanceState = {
  erc20Allowance: ALLOWANCE_CAP,
  window: { amount: ALLOWANCE_CAP, expiration: FAR_FUTURE, nonce: 0 },
};

/// `useSetupStatus` is the only collaborator, and it is what holds the stale
/// cache entry this bug turned on. Stubbing it keeps the test on the gating
/// logic rather than on react-query's disabled-query semantics.
const status = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("./setup/use-setup-status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./setup/use-setup-status")>()),
  useSetupStatus: () => status.current,
}));

function setup(asEth: boolean, over: Record<string, unknown> = {}) {
  status.current = {
    data: [NOTHING_APPROVED],
    isError: false,
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
    ...over,
  };
  return renderHook(() =>
    useDepositSetup({ asEth, pulls: [{ asset: WETH_ASSET, amount: asBaseUnits(1_000n) }] }),
  ).result.current;
}

/// A deposit of WETH paying its relayer in DAI: two pulls, two allowances.
function crossSetup(weth: Permit2AllowanceState, dai: Permit2AllowanceState) {
  status.current = {
    data: [weth, dai],
    isError: false,
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
  };
  return renderHook(() =>
    useDepositSetup({
      asEth: false,
      pulls: [
        { asset: WETH_ASSET, amount: asBaseUnits(1_000n) },
        { asset: DAI_ASSET, amount: asBaseUnits(42n) },
      ],
    }),
  ).result.current;
}

describe("useDepositSetup", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

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
    const s = setup(false, { isError: true, data: [undefined] });
    expect(s.blocked).toBe(true);
    expect(s.unknown).toBe(true);
  });
});

// A relayer fee paid in another token is pulled through that token's own
// approval and window; the SDK takes the AllowanceTransfer path only when every
// token is covered.
describe("useDepositSetup across two tokens", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  it("blocks on the fee token alone, and names only it", () => {
    const s = crossSetup(COVERED, NOTHING_APPROVED);
    expect(s.blocked).toBe(true);
    expect(s.needs.needsSetup).toBe(true);
    expect(s.assets.map((a) => a.symbol)).toEqual(["DAI"]);
    expect(s.willApproveErc20(DAI_ASSET)).toBe(true);
    expect(s.willApproveErc20(WETH_ASSET)).toBe(false);
  });

  // The card predicts the run, which sets up only the tokens it names: an
  // ERC-20 allowance below the cap on a token already covered sends nothing.
  it("predicts an approval only for a token it names", () => {
    const belowCap: Permit2AllowanceState = { ...COVERED, erc20Allowance: 10n ** 6n };
    const windowOnly: Permit2AllowanceState = {
      ...NOTHING_APPROVED,
      erc20Allowance: ALLOWANCE_CAP,
    };
    const s = crossSetup(belowCap, windowOnly);
    expect(s.assets.map((a) => a.symbol)).toEqual(["DAI"]);
    expect(s.needs.willApproveErc20).toBe(true);
    expect(s.assets.some(s.willApproveErc20)).toBe(false);
  });

  it("names both when both need it", () => {
    const s = crossSetup(NOTHING_APPROVED, NOTHING_APPROVED);
    expect(s.assets.map((a) => a.symbol)).toEqual(["WETH", "DAI"]);
  });
});
