import { describe, expect, it } from "vitest";
import { amountInWords, numberWord } from "./words";

describe("amountInWords", () => {
  it("writes the design's two examples", () => {
    expect(amountInWords("250", "USDC")).toBe("Two hundred fifty and 00/100 USDC");
    expect(amountInWords("1.5", "ETH")).toBe("One and 50/100 ETH");
  });

  it("says zero rather than nothing", () => {
    expect(amountInWords("0", "ETH")).toBe("Zero and 00/100 ETH");
    expect(amountInWords("0.25", "USDC")).toBe("Zero and 25/100 USDC");
  });

  it("spells the teens and the compound tens", () => {
    expect(amountInWords("13", "X")).toBe("Thirteen and 00/100 X");
    expect(amountInWords("19", "X")).toBe("Nineteen and 00/100 X");
    expect(amountInWords("20", "X")).toBe("Twenty and 00/100 X");
    expect(amountInWords("42", "X")).toBe("Forty-two and 00/100 X");
    expect(amountInWords("110", "X")).toBe("One hundred ten and 00/100 X");
  });

  it("names thousands, millions and billions, skipping empty groups", () => {
    expect(amountInWords("1000", "X")).toBe("One thousand and 00/100 X");
    expect(amountInWords("8420", "X")).toBe("Eight thousand four hundred twenty and 00/100 X");
    expect(amountInWords("1000001", "X")).toBe("One million one and 00/100 X");
    expect(amountInWords("2500000000", "X")).toBe("Two billion five hundred million and 00/100 X");
  });

  it("is exact past the float range", () => {
    expect(amountInWords("18446744073709551617", "WEI")).toBe(
      "Eighteen quintillion four hundred forty-six quadrillion seven hundred forty-four " +
        "trillion seventy-three billion seven hundred nine million five hundred fifty-one " +
        "thousand six hundred seventeen and 00/100 WEI",
    );
  });

  it("falls back to digits past the named scales rather than guessing", () => {
    const huge = `1${"0".repeat(40)}`;
    expect(amountInWords(huge, "X")).toMatch(/^10,000,000,000.* and 00\/100 X$/);
  });

  it("ignores leading zeros and grouping", () => {
    expect(amountInWords("007", "X")).toBe("Seven and 00/100 X");
    expect(amountInWords("1,234.5", "X")).toBe("One thousand two hundred thirty-four and 50/100 X");
  });

  it("states the fraction in the digits typed, never fewer than two", () => {
    expect(amountInWords("1.05", "X")).toBe("One and 05/100 X");
    expect(amountInWords("1.500", "X")).toBe("One and 500/1000 X");
    expect(amountInWords("0.000001", "ETH")).toBe("Zero and 000001/1000000 ETH");
    expect(amountInWords("3.", "X")).toBe("Three and 00/100 X");
  });

  it("returns nothing for input that is not an amount", () => {
    for (const bad of ["", " ", ".", ".5", "-1", "1e3", "abc", "1.2.3"]) {
      expect(amountInWords(bad, "X"), bad).toBe("");
    }
  });

  it("omits the symbol when there is none", () => {
    expect(amountInWords("2", "")).toBe("Two and 00/100");
  });
});

describe("numberWord", () => {
  it("spells small counts and leaves the rest as digits", () => {
    expect(numberWord(0)).toBe("zero");
    expect(numberWord(4)).toBe("four");
    expect(numberWord(10)).toBe("ten");
    expect(numberWord(11)).toBe("11");
    expect(numberWord(-1)).toBe("-1");
    expect(numberWord(1.5)).toBe("1.5");
  });
});
