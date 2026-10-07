import { describe, expect, it } from "vitest";
import { hexAddress, SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { addressEnds, addressLayout, sameAddress, shortAddr } from "./address";

describe("shortAddr", () => {
  it("elides the middle of a full address", () => {
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

describe("addressLayout", () => {
  it("sets a shielded address's prefix apart and rows the rest in six groups of four", () => {
    const { prefix, rows } = addressLayout(SHIELDED_ADDRESS);
    expect(prefix).toBe("lelantos1");
    expect(rows[0]).toEqual(["kywv", "2fth", "uaqw", "s06v", "elmd", "vnuf"]);
    expect(rows).toHaveLength(8);
    expect(rows.at(-1)).toEqual(["pn4z", "k9l9", "0s5q", "2sha", "mv"]);
  });

  it("keeps every character, in order", () => {
    for (const value of [SHIELDED_ADDRESS, hexAddress("1a"), "ab", ""]) {
      const { prefix, rows } = addressLayout(value);
      expect(prefix + rows.flat().join("")).toBe(value);
    }
  });

  it("rows an EVM address in two, after its 0x", () => {
    const { prefix, rows } = addressLayout(hexAddress("1a"));
    expect(prefix).toBe("0x");
    expect(rows.map((row) => row.length)).toEqual([6, 4]);
    expect(rows[1]?.at(-1)).toBe("1a1a");
  });
});

describe("addressEnds", () => {
  it("gives the groups an address starts and ends on, as its full layout has them", () => {
    expect(addressEnds(SHIELDED_ADDRESS)).toEqual({
      prefix: "lelantos1",
      head: "kywv 2fth",
      tail: "2sha mv",
    });
  });
});
