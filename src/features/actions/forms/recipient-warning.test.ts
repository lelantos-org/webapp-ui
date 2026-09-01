import { describe, expect, it } from "vitest";
import { isSelfWithdraw } from "./recipient-warning";

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
