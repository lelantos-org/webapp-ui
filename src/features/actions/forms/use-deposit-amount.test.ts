import { evmAddress } from "@lelantos-org/sdk";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RegisteredAsset } from "@/features/assets";
import { useDepositAmount } from "./use-deposit-amount";

const USDC: RegisteredAsset = {
  id: 1n,
  token: evmAddress("0x0000000000000000000000000000000000000001"),
  isWeth: false,
  symbol: "USDC",
  decimals: 6,
  // `scale: 1n` keeps circuit units and base units the same, so the max
  // arithmetic below is readable without a conversion in the way.
  scale: 1n,
};

const FEE_BPS = 30n;

/// The chain reads this hook composes. Stubbed so the test stays on the
/// gating rules rather than on react-query's disabled-query semantics — the
/// same trade `use-deposit-setup.test` makes.
const stubs = vi.hoisted(() => ({
  preview: {} as Record<string, unknown>,
  feeBps: undefined as bigint | undefined,
  sourceBalance: undefined as bigint | undefined,
  feeQuote: {} as Record<string, unknown>,
}));

vi.mock("../use-fee-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../use-fee-preview")>()),
  useFeePreview: () => stubs.preview,
  useFeeBps: () => stubs.feeBps,
}));

/// The relayer's flat charge for flushing the deposit. Real `resolveFeeOption`
/// and `feeOptionFor` — only the query is stubbed, so the registry join stays
/// under test.
vi.mock("../use-fee-quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../use-fee-quote")>()),
  useFeeQuote: () => stubs.feeQuote,
}));

vi.mock("@/features/assets/transparent-balances", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets/transparent-balances")>()),
  useDepositSourceBalance: () => stubs.sourceBalance,
}));

vi.mock("@/features/assets/registered-assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets/registered-assets")>()),
  useRegisteredAssets: () => [USDC],
}));

interface Options {
  asEth?: boolean;
  input?: string;
  balance?: bigint;
  feeBps?: bigint;
  preview?: Record<string, unknown>;
  /// Relayer charge in circuit units of USDC. Zero unless a case says
  /// otherwise, which keeps the pre-existing max arithmetic readable.
  relayerFee?: bigint;
}

function deposit({
  asEth = false,
  input = "100",
  balance,
  feeBps,
  preview,
  relayerFee = 0n,
}: Options = {}) {
  stubs.sourceBalance = balance;
  stubs.feeBps = feeBps;
  stubs.feeQuote = {
    data: {
      charged: relayerFee > 0n,
      options: [{ asset: USDC, amount: relayerFee, balance: relayerFee, affordable: true }],
    },
    isPending: false,
  };
  stubs.preview = {
    // A settled preview for `input` at `FEE_BPS`, unless the case overrides it.
    data: { inAmt: 100n, fee: 0n, total: 100n, feeBps: FEE_BPS, mode: "deposit" },
    stale: false,
    isError: false,
    refetch: vi.fn(),
    ...preview,
  };
  return renderHook(() => useDepositAmount(USDC, { asEth, input })).result.current;
}

describe("useDepositAmount", () => {
  it("offers a max that leaves room for the fee", () => {
    // 1000 base units at 30bps: 998 is the most that fits once the fee lands
    // on top of it.
    expect(deposit({ balance: 1_000n, feeBps: FEE_BPS }).maxAmount).toBe(998n);
  });

  it("offers no max on the native-ETH path", () => {
    // The funding source is the native balance and the deposit's own gas is
    // unknowable here, so any figure offered is one the user cannot send.
    expect(deposit({ asEth: true, balance: 1_000n, feeBps: FEE_BPS }).maxAmount).toBeUndefined();
  });

  it("offers no max before the chain-wide fee is known", () => {
    expect(deposit({ balance: 1_000n, feeBps: undefined }).maxAmount).toBeUndefined();
  });

  it("withholds a preview that describes an earlier keystroke", () => {
    // While the debounce catches up, `data` is the previous amount's fee. Using
    // it would validate one amount against another's cost.
    const d = deposit({ balance: 10_000n, preview: { stale: true } });

    expect(d.fee).toBeUndefined();
    expect(d.total).toBeUndefined();
    expect(d.validation.feeUnknown).toBe(true);
    expect(d.validation.valid).toBe(false);
  });

  it("separates a failed fee read from one that has not settled", () => {
    // Both leave the submit disabled, but only this one needs saying out loud:
    // react-query does not retry unprompted, so nothing clears it on its own.
    const settling = deposit({ balance: 10_000n, preview: { stale: true } });
    const failed = deposit({ balance: 10_000n, preview: { isError: true, data: undefined } });

    expect(settling.feeFailed).toBe(false);
    expect(failed.feeFailed).toBe(true);
    expect(failed.validation.valid).toBe(false);
  });

  it("hands back a way to re-run the failed read", () => {
    const refetch = vi.fn();
    deposit({ preview: { isError: true, data: undefined, refetch } }).retryFee();

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("reports the total leaving the wallet, fee included", () => {
    const d = deposit({
      balance: 10_000n,
      preview: { data: { inAmt: 100n, fee: 3n, total: 103n, feeBps: FEE_BPS, mode: "deposit" } },
    });

    expect(d.total).toBe(103n);
    expect(d.validation.valid).toBe(true);
  });
});

// The relayer's note is funded by the same Permit2 pull as the amount and the
// protocol fee (`resolveDepositFee`), so both the allowance and the "max"
// button have to reserve it. Under-reserving either is a deposit that fails at
// submit rather than in the form.
describe("relayer fee", () => {
  it("adds it to the total the Permit2 allowance is sized against", () => {
    expect(deposit({ balance: 1_000n, feeBps: 0n, relayerFee: 7n }).total).toBe(107n);
    expect(deposit({ balance: 1_000n, feeBps: 0n, relayerFee: 0n }).total).toBe(100n);
  });

  it("reserves it out of the max", () => {
    // Flat, not proportional — the relayer prices gas, not value — so at 0 bps
    // it comes straight off the balance.
    expect(deposit({ balance: 1_000n, feeBps: 0n, relayerFee: 7n }).maxAmount).toBe(993n);
  });

  it("withholds the total until the quote lands, rather than under-sizing it", () => {
    // Seed every other stub through the helper, then take the quote away — so
    // this asserts about the pending quote and not about leftover state.
    deposit({ balance: 1_000n, feeBps: 0n });
    stubs.feeQuote = { data: undefined, isPending: true };
    const r = renderHook(() => useDepositAmount(USDC, { asEth: false, input: "100" })).result
      .current;
    expect(r.relayerFee).toBeUndefined();
    expect(r.total).toBeUndefined();
  });
});
