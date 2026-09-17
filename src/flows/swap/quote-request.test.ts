import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { quoteRequest } from "./quote-request";

const asset = (id: bigint, token: string, scale = 1_000_000n) =>
  makeAsset(id, `T${id}`, { token, scale });

const A = asset(1n, "0x1111111111111111111111111111111111111111");
const B = asset(2n, "0x2222222222222222222222222222222222222222");

const input = (over: Partial<Parameters<typeof quoteRequest>[0]> = {}) => ({
  inAsset: A,
  outAsset: B,
  amount: 5n,
  amountValid: true,
  slippageBps: 50,
  ...over,
});

describe("quoteRequest", () => {
  it("names the pair by id and the typed amount as the gross", () => {
    expect(quoteRequest(input())).toEqual({
      assetIn: 1n,
      assetOut: 2n,
      gross: 5n,
      slippageBps: 50,
    });
  });

  it("withholds a request while either side of the pair is unresolved", () => {
    expect(quoteRequest(input({ inAsset: undefined }))).toBeUndefined();
    expect(quoteRequest(input({ outAsset: undefined }))).toBeUndefined();
  });

  it("withholds a request for a pair of the same asset", () => {
    expect(quoteRequest(input({ outAsset: A }))).toBeUndefined();
  });

  it("withholds a request when the amount does not validate", () => {
    expect(quoteRequest(input({ amountValid: false }))).toBeUndefined();
  });

  it("withholds a request when the amount does not parse", () => {
    expect(quoteRequest(input({ amount: undefined }))).toBeUndefined();
  });

  it("treats a zero amount as quotable only if validation says so", () => {
    expect(quoteRequest(input({ amount: 0n, amountValid: false }))).toBeUndefined();
    expect(quoteRequest(input({ amount: 0n }))?.gross).toBe(0n);
  });
});
