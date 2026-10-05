import { describe, expect, it } from "vitest";
import { SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { USDC_ASSET } from "@/test/fixtures/assets";
import { type RequestLinkInputs, requestLink } from "./request-link";

const ready: RequestLinkInputs = {
  origin: "https://wallet.example",
  chainId: 31337n,
  address: SHIELDED_ADDRESS,
  hasAssets: true,
  selected: USDC_ASSET,
  amountText: "12.5",
  parsed: 12_500_000n,
  amountValid: true,
  memoText: "",
};

describe("requestLink", () => {
  it("asks for the entered amount at this wallet's address", () => {
    expect(requestLink(ready)).toEqual({
      url: `https://wallet.example/send#to=${SHIELDED_ADDRESS}&asset=1&amount=12.5&chain=31337`,
      amountLabel: "12.5 USDC",
    });
  });

  it("carries the memo, and none when the field is empty", () => {
    const link = requestLink({ ...ready, memoText: "INV-0042 · grazie" });
    expect(link.url).toBe(
      `https://wallet.example/send#to=${SHIELDED_ADDRESS}&asset=1&amount=12.5&chain=31337` +
        "&memo=INV-0042+%C2%B7+grazie",
    );
    expect(requestLink(ready).url).not.toContain("memo");
  });

  it("writes the amount the way the payer's field reads it", () => {
    const link = requestLink({ ...ready, amountText: "1.234,5", parsed: 1_234_500_000n });
    expect(link.url).toContain("&amount=1234.5&");
  });

  it.each<[string, Partial<RequestLinkInputs>, string | undefined]>([
    ["a network with no assets", { hasAssets: false }, "No assets on this network"],
    ["no asset chosen", { selected: undefined }, "Choose an asset"],
    ["an empty amount", { amountText: "", parsed: undefined }, "Enter an amount to request"],
    ["a zero amount", { amountText: "0", parsed: 0n }, "Enter an amount to request"],
    ["text", { amountText: "abc", parsed: undefined }, "Enter the amount as a number"],
    [
      "more decimals than the asset has",
      { amountText: "0.0000001", parsed: undefined },
      "USDC can't be split that finely",
    ],
    ["an amount the field already rejects", { amountValid: false }, undefined],
    ["a wallet still being built", { address: undefined }, undefined],
    ["a memo the field already rejects", { memoText: "a".repeat(129) }, undefined],
  ])("has no link for %s", (_, over, reason) => {
    expect(requestLink({ ...ready, ...over })).toEqual({ reason });
  });
});
