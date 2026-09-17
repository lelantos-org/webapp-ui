import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asBaseUnits } from "@/shared/domain/units";
import { makeAsset } from "@/test/fixtures/assets";
import { ALLOWANCE_CAP, type Permit2AllowanceState } from "./setup/permit2-setup";
import { useDepositSetup } from "./use-deposit-setup";

const WETH_ASSET = makeAsset(1n, "WETH");
const DAI_ASSET = makeAsset(2n, "DAI");
const NOW = Date.UTC(2026, 0, 1);
const FAR_FUTURE = Math.floor(NOW / 1000) + 30 * 24 * 3600;

const NOTHING_APPROVED: Permit2AllowanceState = {
  erc20Allowance: 0n,
  window: { amount: 0n, expiration: FAR_FUTURE, nonce: 0 },
};

const COVERED: Permit2AllowanceState = {
  erc20Allowance: ALLOWANCE_CAP,
  window: { amount: ALLOWANCE_CAP, expiration: FAR_FUTURE, nonce: 0 },
};

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

  it("blocks an ERC-20 deposit whose allowances cannot be read", () => {
    const s = setup(false, { isError: true, data: [undefined] });
    expect(s.blocked).toBe(true);
    expect(s.unknown).toBe(true);
  });
});

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
