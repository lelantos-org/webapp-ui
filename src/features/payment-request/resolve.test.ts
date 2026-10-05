import { describe, expect, it } from "vitest";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { makeAsset, USDC_ASSET } from "@/test/fixtures/assets";
import { resolvePaymentRequest } from "./resolve";

const DAI = makeAsset(2n, "DAI");
const ASSETS = [USDC_ASSET, DAI];
const fragment = (over: Record<string, string> = {}) =>
  `#${new URLSearchParams({ to: SHIELDED_ADDRESS, asset: "1", amount: "12.5", chain: "31337", ...over })}`;

describe("resolvePaymentRequest", () => {
  it("is nothing without a request in the fragment, or without a chain", () => {
    expect(resolvePaymentRequest("", 31337n, ASSETS)).toEqual({ status: "none" });
    expect(resolvePaymentRequest("#", 31337n, ASSETS)).toEqual({ status: "none" });
    expect(resolvePaymentRequest("#main", 31337n, ASSETS)).toEqual({ status: "none" });
    expect(resolvePaymentRequest(fragment(), undefined, ASSETS)).toEqual({ status: "none" });
  });

  it("resolves a request the active chain can pay", () => {
    expect(resolvePaymentRequest(fragment(), 31337n, ASSETS)).toEqual({
      status: "ready",
      request: { chainId: 31337n, to: SHIELDED_ADDRESS, asset: 1n, amount: "12.5" },
      asset: USDC_ASSET,
    });
  });

  it("carries the memo the request asks for", () => {
    const state = resolvePaymentRequest(fragment({ memo: "rent, 3B" }), 31337n, ASSETS);
    expect(state).toMatchObject({ status: "ready", request: { memo: "rent, 3B" } });
  });

  it("waits for the chain's assets", () => {
    expect(resolvePaymentRequest(fragment(), 31337n, [])).toEqual({ status: "none" });
  });

  it("names the chain of a request made elsewhere, whatever its asset id means here", () => {
    expect(resolvePaymentRequest(fragment({ chain: "10", asset: "99" }), 31337n, ASSETS)).toEqual({
      status: "other-chain",
      chainId: 10n,
    });
  });

  it("refuses an asset the chain does not list", () => {
    expect(resolvePaymentRequest(fragment({ asset: "99" }), 31337n, ASSETS)).toEqual({
      status: "unlisted-asset",
    });
  });

  it.each([
    ["an address that is not shielded", { to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" }],
    ["a truncated address", { to: SHIELDED_ADDRESS.slice(0, -1) }],
    ["an amount finer than the asset", { amount: "0.0000001" }],
    ["a zero amount", { amount: "0" }],
    ["a missing chain", { chain: "" }],
    ["a memo longer than a payment can carry", { memo: "a".repeat(129) }],
    ["a memo with U+0000", { memo: "a\0b" }],
  ])("rejects %s", (_, over) => {
    expect(resolvePaymentRequest(fragment(over), 31337n, ASSETS)).toEqual({ status: "invalid" });
  });
});
