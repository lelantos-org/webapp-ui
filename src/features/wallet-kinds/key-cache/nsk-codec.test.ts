import { describe, expect, it } from "vitest";
import { unwrap } from "@/test/result";
import { NSK_HEX_LEN, nskFieldFromHex, nskHexFromField } from "./nsk-codec";

const SAMPLE = "1".repeat(NSK_HEX_LEN);

describe("nskFieldFromHex", () => {
  it("accepts plain hex of correct length", () => {
    expect(nskFieldFromHex(SAMPLE).ok).toBe(true);
  });

  it("accepts 0x-prefixed hex", () => {
    expect(nskFieldFromHex(`0x${SAMPLE}`).ok).toBe(true);
  });

  it.each([
    ["empty", "", "invalid-length"],
    ["too short", "ab", "invalid-length"],
    ["too long", `${SAMPLE}ff`, "invalid-length"],
    ["odd length", "1".repeat(NSK_HEX_LEN - 1), "invalid-length"],
    ["non-hex char", "g".repeat(NSK_HEX_LEN), "invalid-hex"],
  ])("rejects %s with %s", (_label, input, code) => {
    const r = nskFieldFromHex(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(code);
  });
});

describe("nskHexFromField round-trip", () => {
  it("hex → field → hex preserves value", () => {
    const f = unwrap(nskFieldFromHex(SAMPLE));
    expect(nskHexFromField(f)).toBe(SAMPLE);
  });
});
