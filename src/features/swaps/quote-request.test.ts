// `quoteRequest` decides whether the form is holding a quotable trade. Every
// case below is one where returning a request instead of `undefined` would
// quote a route the proof cannot match, or quote nothing at all.

import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { quoteRequest } from "./quote-request";

const asset = (id: bigint, token: string, scale = 1_000_000n): RegisteredAsset =>
  ({ id, token, scale }) as RegisteredAsset;

const A = asset(1n, "0x1111111111111111111111111111111111111111");
const B = asset(2n, "0x2222222222222222222222222222222222222222");

const input = (over: Partial<Parameters<typeof quoteRequest>[0]> = {}) => ({
  chainId: 31337n,
  inAsset: A,
  outAsset: B,
  amount: 5n,
  amountValid: true,
  slippageBps: 50,
  ...over,
});

describe("quoteRequest", () => {
  it("scales the amount into token base units", () => {
    expect(quoteRequest(input())).toEqual({
      chainId: 31337n,
      tokenIn: A.token,
      tokenOut: B.token,
      amountIn: 5n * A.scale,
      slippageBps: 50,
    });
  });

  it("withholds a request while either side of the pair is unresolved", () => {
    expect(quoteRequest(input({ inAsset: undefined }))).toBeUndefined();
    expect(quoteRequest(input({ outAsset: undefined }))).toBeUndefined();
  });

  it("withholds a request for a pair of the same asset", () => {
    // Not a trade, and MetaQuoter has no route for it.
    expect(quoteRequest(input({ outAsset: A }))).toBeUndefined();
  });

  it("withholds a request when the amount does not validate", () => {
    // Covers an amount over the balance: quoting it would bind a route the
    // spend cannot fund.
    expect(quoteRequest(input({ amountValid: false }))).toBeUndefined();
  });

  it("withholds a request when the amount does not parse", () => {
    expect(quoteRequest(input({ amount: undefined }))).toBeUndefined();
  });

  it("treats a zero amount as quotable only if validation says so", () => {
    // `quoteRequest` does not re-derive validity; `validateAmount` owns that,
    // and duplicating the rule here is how the two drift apart.
    expect(quoteRequest(input({ amount: 0n, amountValid: false }))).toBeUndefined();
    expect(quoteRequest(input({ amount: 0n }))?.amountIn).toBe(0n);
  });
});
