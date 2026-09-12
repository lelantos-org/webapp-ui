import { describe, expect, it } from "vitest";
import { monogramStyle, monogramText } from "./monogram";

/// `monogramStyle` returns `CSSProperties`, which has no index signature for
/// custom properties. The variables are the whole point of it, so tests read
/// them through one cast rather than one per assertion.
const vars = (seed: string, brand?: [number, number, number]) =>
  monogramStyle(seed, brand) as unknown as Record<string, string>;

/// The hue the style carries, as a number, so assertions read as colours.
const hue = (seed: string) => Number(vars(seed)["--mono-h"]);

describe("monogramText", () => {
  it("takes two letters, uppercased", () => {
    expect(monogramText("usdc")).toBe("US");
    expect(monogramText("WETH")).toBe("WE");
  });

  it("drops the # of an unresolved label so the id shows instead", () => {
    // `chains.ts` falls back to `#<id>` when the indexer has not read
    // `symbol()`. Keeping the `#` would give every unnamed asset on a chain
    // the same two characters.
    expect(monogramText("#12")).toBe("12");
    expect(monogramText("#7")).toBe("7");
  });

  it("never renders empty", () => {
    expect(monogramText("")).toBe("?");
    expect(monogramText("   ")).toBe("?");
  });
});

describe("monogramStyle", () => {
  it("is stable for the same seed", () => {
    // The point of deriving rather than storing: the same token gets the same
    // mark on every load and every device.
    expect(vars("0xabc")).toEqual(vars("0xabc"));
  });

  it("ignores address casing", () => {
    // The chain registry hands out checksummed addresses while the price rows
    // are lowercase; the same token must not get two marks depending on which
    // spelling reached the component.
    expect(vars("0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48")).toEqual(
      vars("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
    );
  });

  it("separates addresses that differ only at the end", () => {
    // Why FNV-1a and not a character sum: registry addresses share long
    // prefixes, and a sum would hand a whole deployment near-identical hues.
    const a = hue("0x0000000000000000000000000000000000000001");
    const b = hue("0x0000000000000000000000000000000000000002");
    expect(Math.abs(a - b)).toBeGreaterThan(20);
  });

  it("stays a legal hue for any seed", () => {
    for (const seed of ["", "?", "0x", "a".repeat(200), "\u{1f600}"]) {
      const h = hue(seed);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it("lets a brand colour override the derived hue", () => {
    const derived = vars("0xabc");
    const branded = vars("0xabc", [211, 82, 47]);

    expect(branded).toEqual({ "--mono-h": "211", "--mono-s": "82%", "--mono-l": "47%" });
    expect(branded).not.toEqual(derived);
  });

  it("holds saturation and lightness fixed across derived marks", () => {
    // Hashing these too would make some tokens read as emphasised and others as
    // disabled, which the colour is not meant to convey.
    const a = vars("0xaaa");
    const b = vars("0xbbb");
    expect(a["--mono-s"]).toBe(b["--mono-s"]);
    expect(a["--mono-l"]).toBe(b["--mono-l"]);
  });
});
