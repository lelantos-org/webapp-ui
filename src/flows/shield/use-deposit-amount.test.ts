// @vitest-environment jsdom
import { RAY } from "@lelantos-org/sdk/protocol";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import { useDepositAmount } from "./use-deposit-amount";

/// `scale: 1n` keeps circuit units and base units the same, so the max
/// arithmetic below is readable without a conversion in the way.
const USDC = USDC_ASSET;

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

/// The two fee reads, and the relayer's flat charge for flushing the deposit.
/// Real `resolveFeeOption` and `feeOptionFor` — only the queries are stubbed, so
/// the registry join stays under test.
vi.mock("@/features/fees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/fees")>()),
  useFeePreview: () => stubs.preview,
  useAssetFeeBps: () => stubs.feeBps,
  useFeeQuote: () => stubs.feeQuote,
}));

/// A yield asset whose units have grown half again: one unit is worth 1.5 base
/// units, so a figure that leaves the index out understates it by a third.
const YIELD_USDC: RegisteredAsset = {
  ...USDC,
  id: 2n,
  symbol: "yUSDC",
  index: (RAY * 3n) / 2n,
  yieldEnabled: true,
};

/// A plain asset at `scale` 1000 in another token, for a relayer paid elsewhere.
const DAI: RegisteredAsset = makeAsset(3n, "DAI", { scale: 1_000n });

vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  useDepositSourceBalance: () => stubs.sourceBalance,
  useRegisteredAssets: () => [USDC, YIELD_USDC, DAI],
}));

interface Options {
  asset?: RegisteredAsset;
  asEth?: boolean;
  input?: string;
  balance?: bigint;
  feeBps?: bigint | undefined;
  preview?: Record<string, unknown>;
  /// Relayer charge in circuit units of `asset`. Zero unless a case says
  /// otherwise, which keeps the pre-existing max arithmetic readable.
  relayerFee?: bigint;
  /// The whole relayer quote read, replacing the one `relayerFee` describes.
  quote?: Record<string, unknown>;
}

function deposit({
  asset = USDC,
  asEth = false,
  input = "100",
  balance,
  feeBps,
  preview,
  relayerFee = 0n,
  quote,
}: Options = {}) {
  stubs.sourceBalance = balance;
  stubs.feeBps = feeBps;
  stubs.feeQuote = quote ?? {
    data: {
      charged: relayerFee > 0n,
      options: [{ asset, amount: relayerFee, balance: relayerFee, affordable: true }],
    },
    isPending: false,
  };
  stubs.preview = {
    // A settled preview for `input` at `FEE_BPS`, unless the case overrides it.
    data: { inAmt: 100n, fee: 0n, total: 100n, feeBps: FEE_BPS, leg: "deposit" },
    stale: false,
    isError: false,
    refetch: vi.fn(),
    ...preview,
  };
  return renderHook(() => useDepositAmount(asset, { asEth, input })).result.current;
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

  it("offers no max before the asset's fee rate is known", () => {
    expect(deposit({ balance: 1_000n, feeBps: undefined }).maxAmount).toBeUndefined();
  });

  it("withholds a preview that describes an earlier keystroke", () => {
    // While the debounce catches up, `data` is the previous amount's fee. Using
    // it would validate one amount against another's cost.
    const d = deposit({ balance: 10_000n, preview: { stale: true } });

    expect(d.fee).toBeUndefined();
    expect(d.pulls[0]?.amount).toBeUndefined();
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
      preview: { data: { inAmt: 100n, fee: 3n, total: 103n, feeBps: FEE_BPS, leg: "deposit" } },
    });

    expect(d.principalTotal).toBe(103n);
    expect(pulled(d)).toEqual([["USDC", 103n]]);
    expect(d.validation.valid).toBe(true);
  });
});

// The relayer's note is funded by the same Permit2 pull as the amount and the
// protocol fee, so both the allowance and the "max"
// button have to reserve it. Under-reserving either is a deposit that fails at
// submit rather than in the form.
describe("relayer fee", () => {
  it("adds it to the pull the Permit2 allowance is sized against", () => {
    expect(pulled(deposit({ balance: 1_000n, feeBps: 0n, relayerFee: 7n }))).toEqual([
      ["USDC", 107n],
    ]);
    expect(pulled(deposit({ balance: 1_000n, feeBps: 0n, relayerFee: 0n }))).toEqual([
      ["USDC", 100n],
    ]);
  });

  it("reserves it out of the max", () => {
    // Flat, not proportional — the relayer prices gas, not value — so at 0 bps
    // it comes straight off the balance.
    expect(deposit({ balance: 1_000n, feeBps: 0n, relayerFee: 7n }).maxAmount).toBe(993n);
  });

  it("withholds the total until the quote lands, rather than under-sizing it", () => {
    const r = deposit({ balance: 1_000n, feeBps: 0n, quote: { data: undefined, isPending: true } });
    expect(r.relayerFee).toBeUndefined();
    expect(r.pulls[0]?.amount).toBeUndefined();
    expect(r.validation.feeUnknown).toBe(true);
  });
});

// The relayer quotes in circuit units, and the Permit2 pull is in base units.
// For a yield asset the conversion carries the index; `amount * scale` alone
// reserved too little for the fee in the total and in the max.
describe("relayer fee on a yield asset", () => {
  const yieldDeposit = (balance: bigint) =>
    deposit({ asset: YIELD_USDC, balance, feeBps: 0n, relayerFee: 7n });

  it("converts the charge through the index, as the fee panel does", () => {
    // 7 units at 1.5 base units each, floored.
    expect(yieldDeposit(1_000n).relayerFee).toBe(10n);
    expect(pulled(yieldDeposit(1_000n))).toEqual([["yUSDC", 110n]]);
  });

  it("reserves the indexed charge out of the max", () => {
    // 990 base units left after the fee buy 660 units at 1.5 each; 661 would
    // cost 992 and overrun the balance with the fee on top.
    expect(yieldDeposit(1_000n).maxAmount).toBe(660n);
  });
});

// A failed quote and a quote with no option for the asset used to read as a free
// relay, sizing the Permit2 window short of what the pool pulls.
describe("relayer fee that cannot be known", () => {
  const withQuote = (quote: Record<string, unknown>) =>
    deposit({ balance: 1_000n, feeBps: 0n, quote });

  it("is unknown, not zero, when the quote failed", () => {
    const r = withQuote({ data: undefined, isPending: false, isError: true, refetch: vi.fn() });
    expect(r.relayerFee).toBeUndefined();
    expect(r.pulls[0]?.amount).toBeUndefined();
    expect(r.relayerProblem).toBe("quote-failed");
    expect(r.validation.valid).toBe(false);
  });

  it("is unknown when the relayer charges but quotes nothing for this asset", () => {
    const r = withQuote({ data: { charged: true, options: [] }, isPending: false });
    expect(r.relayerFee).toBeUndefined();
    expect(r.relayerProblem).toBe("not-accepted");
    expect(r.validation.valid).toBe(false);
  });

  it("is zero only when the chain does not charge", () => {
    const r = withQuote({ data: { charged: false, options: [] }, isPending: false });
    expect(r.relayerFee).toBe(0n);
    expect(r.relayerProblem).toBeUndefined();
  });

  it("does not price with another chain's placeholder quote", () => {
    const r = withQuote({
      data: {
        charged: true,
        options: [{ asset: USDC, amount: 7n, balance: 0n, affordable: false }],
      },
      isPending: false,
      isPlaceholderData: true,
    });
    expect(r.relayerFee).toBeUndefined();
  });

  it("hands back a way to re-run the quote", () => {
    const refetch = vi.fn();
    withQuote({ data: undefined, isError: true, refetch }).retryRelayerFee();
    expect(refetch).toHaveBeenCalledOnce();
  });
});

// The relayer may be paid in another token: a second pull from the public wallet,
// in that token's own units, which neither the deposit token's pull nor its max
// may absorb. The per-token rules are the SDK's `depositPulls`; these cases pin how the
// hook feeds them.
describe("relayer fee in another token", () => {
  /// USDC deposit of 100 plus a 1 protocol fee, relayer quoting 7 USDC units or
  /// 42 DAI units.
  function cross({
    balance = 1_000n,
    feeAsset = DAI.id,
    asEth = false,
    charged = true,
    options,
  }: {
    balance?: bigint;
    feeAsset?: bigint;
    asEth?: boolean;
    charged?: boolean;
    options?: unknown[];
  } = {}) {
    stubs.sourceBalance = balance;
    stubs.feeBps = 0n;
    stubs.feeQuote = {
      data: {
        charged,
        options: options ?? [
          { asset: USDC, amount: 7n, balance: 0n, affordable: true },
          { asset: DAI, amount: 42n, balance: 0n, affordable: true },
        ],
      },
      isPending: false,
    };
    stubs.preview = {
      data: { inAmt: 100n, fee: 1n, total: 101n, feeBps: 100n, leg: "deposit" },
      stale: false,
      isError: false,
      refetch: vi.fn(),
    };
    const hook = renderHook(() => useDepositAmount(USDC, { asEth, input: "100" }));
    act(() => hook.result.current.onFeeAsset(feeAsset));
    return hook.result.current;
  }

  it("states the principal and the relayer fee per token", () => {
    const d = cross();
    expect(d.feeAsset).toBe(DAI.id);
    expect(d.separateFee).toBe(DAI);
    expect(d.principalTotal).toBe(101n);
    // 42 units at DAI's scale of 1000.
    expect(d.relayerFee).toBe(42_000n);
    expect(pulled(d)).toEqual([
      ["USDC", 101n],
      ["DAI", 42_000n],
    ]);
  });

  it("validates the deposit token against the principal alone, and reserves no fee from its max", () => {
    // 101 fits a 101 balance only because the fee is not in USDC.
    expect(cross({ balance: 101n }).validation.valid).toBe(true);
    expect(cross({ balance: 1_000n }).maxAmount).toBe(1_000n);
  });

  it("names the fee asset the relayer does not take, and holds the deposit", () => {
    const d = cross({ options: [{ asset: USDC, amount: 7n, balance: 0n, affordable: true }] });
    expect(d.relayerProblem).toBe("not-accepted");
    expect(d.separateFee).toBe(DAI);
    expect(d.validation.valid).toBe(false);
  });

  it("is one pull when the relayer charges nothing", () => {
    // A zero fee note rides with the principal whatever asset was picked.
    const d = cross({ charged: false, options: [] });
    expect(d.separateFee).toBeUndefined();
    expect(pulled(d)).toEqual([["USDC", 101n]]);
  });

  it("locks the fee asset on the native-ETH path", () => {
    const d = cross({ asEth: true });
    expect(d.feeAsset).toBeUndefined();
    expect(d.separateFee).toBeUndefined();
    expect(d.relayerFee).toBe(7n);
  });

  it("ignores a yield fee asset other than the deposit asset", () => {
    // The pool takes a yield fee asset only for its own deposit.
    const d = cross({ feeAsset: YIELD_USDC.id });
    expect(d.feeAsset).toBeUndefined();
    expect(d.separateFee).toBeUndefined();
  });

  it("stores picking the deposit asset itself as no choice", () => {
    expect(cross({ feeAsset: USDC.id }).feeAsset).toBeUndefined();
  });

  it("falls back to the deposit asset once that is the asset chosen to pay", () => {
    stubs.sourceBalance = 1_000n;
    const hook = renderHook(
      ({ asset }: { asset: RegisteredAsset }) =>
        useDepositAmount(asset, { asEth: false, input: "1" }),
      { initialProps: { asset: USDC } },
    );
    act(() => hook.result.current.onFeeAsset(DAI.id));
    expect(hook.result.current.feeAsset).toBe(DAI.id);
    hook.rerender({ asset: DAI });
    expect(hook.result.current.feeAsset).toBeUndefined();
  });
});

/// Each pull as `[symbol, amount]`, for a readable `toEqual`.
function pulled(d: ReturnType<typeof useDepositAmount>) {
  return d.pulls.map((p) => [p.asset.symbol, p.amount]);
}
