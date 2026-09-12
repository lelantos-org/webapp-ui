import { describe, expect, it } from "vitest";
import { sameAddress, shortAddr } from "./address";

describe("shortAddr", () => {
  it("elides the middle of a full address", () => {
    // Default n=6: "0x" + 6 leading chars, then the 6 trailing chars.
    expect(shortAddr("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x123456…345678");
  });

  it("leaves short strings and empties alone", () => {
    expect(shortAddr("0x1234")).toBe("0x1234");
    expect(shortAddr(undefined)).toBe("");
  });
});

describe("sameAddress", () => {
  it("compares addresses whatever their casing", () => {
    expect(
      sameAddress(
        "0xAbCdEf0000000000000000000000000000000001",
        "0xabcdef0000000000000000000000000000000001",
      ),
    ).toBe(true);
    expect(sameAddress("0x01", "0x02")).toBe(false);
  });
});
