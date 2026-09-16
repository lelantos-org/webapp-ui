import { describe, expect, it } from "vitest";
import { NSK_HEX_LEN } from "@/features/wallet-kinds";
import { unwrap } from "@/test/harness";
import { describeClaimError, encodeClaimPayload, parseClaimFragment } from "./codec";

const SAMPLE = "1".repeat(NSK_HEX_LEN);

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

  // A bare 64-hex nsk with no chain prefix is rejected rather than silently
  // assumed to belong to whichever chain is being viewed.
  it("rejects a link without a chain prefix", () => {
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
