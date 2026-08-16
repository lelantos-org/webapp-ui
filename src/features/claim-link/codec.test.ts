import { describe, expect, it } from "vitest";
import { unwrap } from "@/shared/lib/result";
import {
  describeClaimError,
  encodeClaimPayload,
  NSK_HEX_LEN,
  nskFieldFromHex,
  nskHexFromField,
  parseClaimFragment,
} from "./codec";

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

describe("parseClaimFragment", () => {
  /// `7a69` is 31337.
  const FRAGMENT = `7a69:${SAMPLE}`;

  it("strips leading #", () => {
    expect(parseClaimFragment(`#${FRAGMENT}`).ok).toBe(true);
  });

  it("accepts no #", () => {
    expect(parseClaimFragment(FRAGMENT).ok).toBe(true);
  });

  it("round-trips what encodeClaimPayload produced", () => {
    const parsed = unwrap(parseClaimFragment(encodeClaimPayload(31337n, SAMPLE)));
    expect(parsed.chainId).toBe(31337n);
    expect(parsed.nskHex).toBe(SAMPLE);
  });

  // The format is unversioned by choice, so a pre-multichain link — a bare
  // 64-hex nsk with no chain prefix — is rejected rather than silently
  // assumed to belong to whichever chain is being viewed.
  it("rejects a legacy chainless link", () => {
    const r = parseClaimFragment(SAMPLE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("malformed");
  });

  it.each([
    ["empty", "", "malformed"],
    ["chain prefix only", "7a69:", "invalid-length"],
    ["non-hex chain", `zz:${SAMPLE}`, "invalid-chain"],
    ["zero chain", `0:${SAMPLE}`, "invalid-chain"],
  ])("rejects %s", (_label, input, expected) => {
    const r = parseClaimFragment(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(expected);
  });
});

describe("describeClaimError", () => {
  it("maps invalid-length", () => {
    expect(describeClaimError("invalid-length")).toMatch(/64 hex/);
  });
  it("maps invalid-hex", () => {
    expect(describeClaimError("invalid-hex")).toMatch(/non-hex/);
  });
});
