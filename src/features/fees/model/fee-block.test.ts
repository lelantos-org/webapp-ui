import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it, vi } from "vitest";
import type { FeeAssetOption } from "./fee-block";
import { type FeeBlockInputs, feeBlockFor, feeBlockReason } from "./fee-block";

const price = (id: bigint, symbol: string) => ({
  id,
  symbol,
  decimals: 6,
  scale: 1n,
  index: RAY,
  amount: 250_000n,
});

const option = (id: bigint, symbol: string, affordable: boolean): FeeAssetOption => ({
  ...price(id, symbol),
  balance: affordable ? 10_000_000n : 40_000n,
  affordable,
});

const USDC = 1n;
const ETH = 2n;
const WBTC = 3n;

const inputs = (over: Partial<FeeBlockInputs> = {}): FeeBlockInputs => ({
  payingWith: USDC,
  payingSymbol: "USDC",
  charged: true,
  options: [option(USDC, "USDC", true), option(ETH, "ETH", true)],
  error: undefined,
  retry: () => {},
  ...over,
});

describe("feeBlockFor", () => {
  it("says nothing when the paying asset covers the fee", () => {
    expect(feeBlockFor(inputs())).toBeUndefined();
  });

  it("says nothing while there is no quote yet — unknown is not short", () => {
    expect(feeBlockFor(inputs({ charged: undefined, options: [] }))).toBeUndefined();
  });

  it("says nothing while the paying asset's balance is unread", () => {
    const unread: FeeAssetOption = { ...price(USDC, "USDC"), balance: undefined, affordable: true };
    expect(feeBlockFor(inputs({ options: [unread] }))).toBeUndefined();
  });

  it("says nothing on a subsidised chain", () => {
    expect(feeBlockFor(inputs({ charged: false, options: [] }))).toBeUndefined();
  });

  it("says nothing with no asset to pay in", () => {
    expect(feeBlockFor(inputs({ payingWith: undefined, error: new Error("x") }))).toBeUndefined();
  });

  it("reports a shortfall with the figures and an asset that can pay", () => {
    const block = feeBlockFor(
      inputs({ options: [option(USDC, "USDC", false), option(ETH, "ETH", true)] }),
    );
    expect(block).toEqual(
      expect.objectContaining({
        kind: "shortfall",
        id: USDC,
        symbol: "USDC",
        amount: 250_000n,
        balance: 40_000n,
        alternative: { id: ETH, symbol: "ETH" },
      }),
    );
  });

  it("admits a shortfall with nothing to switch to", () => {
    const block = feeBlockFor(
      inputs({ options: [option(USDC, "USDC", false), option(ETH, "ETH", false)] }),
    );
    expect(block?.kind).toBe("shortfall");
    expect(block?.alternative).toBeUndefined();
  });

  it("blocks on a failed quote, which used to read as no problem", () => {
    const retry = vi.fn();
    const error = new Error("relayer down");
    const block = feeBlockFor(inputs({ charged: undefined, options: [], error, retry }));
    expect(block).toEqual({ kind: "quote-failed", error, retry });
  });

  it("puts a failed quote ahead of a shortfall read off stale options", () => {
    const block = feeBlockFor(
      inputs({ options: [option(USDC, "USDC", false)], error: new Error("refetch failed") }),
    );
    expect(block?.kind).toBe("quote-failed");
  });

  it("blocks a charge with no option for the paying asset, naming one that works", () => {
    const block = feeBlockFor(
      inputs({ payingWith: WBTC, payingSymbol: "WBTC", options: [option(ETH, "ETH", true)] }),
    );
    expect(block).toEqual({
      kind: "not-accepted",
      symbol: "WBTC",
      alternative: { id: ETH, symbol: "ETH" },
    });
  });
});

describe("feeBlockReason", () => {
  const shortfall = (alternative?: { id: bigint; symbol: string }) =>
    feeBlockReason({ ...price(USDC, "USDC"), balance: 40_000n, kind: "shortfall", alternative });

  it("names the fee asset and the one to switch to", () => {
    expect(shortfall({ id: ETH, symbol: "ETH" })).toBe(
      "Not enough USDC to pay the relayer fee — pay it in ETH instead",
    );
    expect(shortfall()).toBe("Not enough USDC to pay the relayer fee");
  });

  it("offers a retry for a failed quote", () => {
    expect(feeBlockReason({ kind: "quote-failed", error: new Error("x"), retry: () => {} })).toBe(
      "Couldn't get the relayer's fee — try again",
    );
  });

  it("names an asset the relayer will not take", () => {
    expect(
      feeBlockReason({
        kind: "not-accepted",
        symbol: "WBTC",
        alternative: { id: ETH, symbol: "ETH" },
      }),
    ).toBe("The relayer doesn't take WBTC for its fee — pay it in ETH instead");
    expect(
      feeBlockReason({ kind: "not-accepted", symbol: undefined, alternative: undefined }),
    ).toBe("The relayer doesn't take this asset for its fee");
  });
});
