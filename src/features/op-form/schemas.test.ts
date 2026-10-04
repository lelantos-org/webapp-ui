import { describe, expect, it } from "vitest";
import { evmAddressField, isEvmAddress, PUBLIC_RECIPIENT, SHIELDED_RECIPIENT } from "./schemas";

// Anvil's first account, in its EIP-55 form.
const CHECKSUMMED = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("PUBLIC_RECIPIENT", () => {
  it("accepts an address in its checksummed form or all in lower case", () => {
    expect(PUBLIC_RECIPIENT.problem(CHECKSUMMED)).toBeUndefined();
    expect(PUBLIC_RECIPIENT.problem(CHECKSUMMED.toLowerCase())).toBeUndefined();
    expect(isEvmAddress(CHECKSUMMED)).toBe(true);
  });

  it("catches a mistyped character through the checksum", () => {
    // One hex digit changed: still forty hex characters, no longer the same address.
    const typo = CHECKSUMMED.replace("f39F", "f39E");
    expect(PUBLIC_RECIPIENT.problem(typo)).toMatch(/typo/);
    expect(isEvmAddress(typo)).toBe(false);
  });

  it("says what a malformed value is not", () => {
    for (const bad of ["", "0x1234", "f39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "lelantos1abc"]) {
      expect(PUBLIC_RECIPIENT.problem(bad), bad).toBe("That is not a valid public address");
    }
  });

  it("gives the schema the same words the form uses", () => {
    const parsed = evmAddressField.safeParse("0x1234");
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("That is not a valid public address");
  });
});

describe("SHIELDED_RECIPIENT", () => {
  it("rejects a public address in its own words", () => {
    expect(SHIELDED_RECIPIENT.problem(CHECKSUMMED)).toBe("That is not a shielded address");
  });
});
