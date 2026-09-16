// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isSelfWithdraw, observerFacts, observerOutro } from "./observer";

describe("observerOutro", () => {
  it("says a shared denomination is a figure many publish, as unshield.dc does", () => {
    expect(observerOutro({ verdict: "on", figure: "500" })).toBe(
      "Two facts, and 500 is a figure many withdrawals publish. The bars are what an observer is denied — never your own figures from you.",
    );
  });

  it("does not claim a crowd for an off-ladder amount", () => {
    const line = observerOutro({ verdict: "off", figure: "523" });
    expect(line).toContain("523 is not a shared denomination");
    expect(line).not.toContain("many withdrawals publish");
    expect(line).toContain("The bars are what an observer is denied");
  });

  it("claims nothing about the amount when there is nothing to judge", () => {
    for (const line of [
      observerOutro({ verdict: undefined, figure: "500" }),
      observerOutro({ verdict: "on", figure: undefined }),
      observerOutro({ verdict: "on", figure: "" }),
    ]) {
      expect(line).toBe(
        "Two facts: where it lands and how much. The bars are what an observer is denied — never your own figures from you.",
      );
    }
  });

  it("has a one-sentence form for the review", () => {
    expect(observerOutro({ verdict: "on", figure: "500", compact: true })).toBe(
      "500 is a shared denomination — many withdrawals publish it.",
    );
    expect(observerOutro({ verdict: "off", figure: "523", compact: true })).toBe(
      "523 is not a shared denomination, so it stands out on-chain.",
    );
    expect(observerOutro({ verdict: undefined, figure: "500", compact: true })).toBeUndefined();
  });
});

describe("observerFacts", () => {
  const WETH = { decimals: 18, scale: 1n, index: 10n ** 27n };
  const to = `0x${"ab".repeat(20)}`;

  it("states the destination and the gross the event carries, in what arrives", () => {
    expect(
      observerFacts({
        to,
        asset: WETH,
        amount: 5n * 10n ** 17n,
        symbol: "ETH",
      }),
    ).toEqual({ destination: "0xabab…abab", amount: "0.50 ETH", figure: "0.5" });
  });

  it("says nothing it cannot yet vouch for", () => {
    expect(observerFacts({ to: "0x12", asset: WETH, amount: 0n, symbol: "ETH" })).toEqual({
      destination: undefined,
      amount: undefined,
      figure: undefined,
    });
  });
});

// A checksummed address and its lowercase form. The pair is the point: wallets
// return either, so both directions of the comparison must match.
const CHECKSUMMED = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const LOWER = CHECKSUMMED.toLowerCase();
const OTHER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("isSelfWithdraw", () => {
  it("matches across casing in both directions", () => {
    expect(isSelfWithdraw(CHECKSUMMED, LOWER)).toBe(true);
    expect(isSelfWithdraw(LOWER, CHECKSUMMED)).toBe(true);
  });

  it("does not match a different address", () => {
    expect(isSelfWithdraw(OTHER, LOWER)).toBe(false);
  });

  it("does not match while no wallet is connected", () => {
    expect(isSelfWithdraw(LOWER, undefined)).toBe(false);
  });

  // One gate, so one case: the field is watched on every keystroke and must stay
  // quiet until what is in it is a complete address.
  it("does not match anything that is not a complete address", () => {
    expect(isSelfWithdraw("", LOWER)).toBe(false);
    expect(isSelfWithdraw(LOWER.slice(0, 20), LOWER)).toBe(false);
    expect(isSelfWithdraw(`${LOWER}00`, LOWER)).toBe(false);
  });
});
