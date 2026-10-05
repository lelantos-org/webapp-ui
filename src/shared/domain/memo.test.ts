import { describe, expect, it } from "vitest";
import { memoByteLength, memoProblem } from "./memo";

describe("memo", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(memoByteLength("")).toBe(0);
    expect(memoByteLength("rent")).toBe(4);
    expect(memoByteLength("né")).toBe(3);
    expect(memoByteLength("租")).toBe(3);
    expect(memoByteLength("🍕")).toBe(4);
  });

  it("accepts no memo and one that fills the field exactly", () => {
    expect(memoProblem("")).toBeUndefined();
    expect(memoProblem("a".repeat(128))).toBeUndefined();
    expect(memoProblem("租".repeat(42))).toBeUndefined();
  });

  it("says by how much a memo is too long", () => {
    expect(memoProblem("a".repeat(129))).toBe("That memo is 1 byte too long");
    expect(memoProblem("租".repeat(43))).toBe("That memo is 1 byte too long");
    expect(memoProblem("a".repeat(140))).toBe("That memo is 12 bytes too long");
  });

  it("refuses U+0000, which the SDK cannot tell from the field's padding", () => {
    expect(memoProblem("a\0b")).toBe("A memo can't contain that character");
  });
});
