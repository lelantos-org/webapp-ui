import { describe, expect, it } from "vitest";
import { accountInitials } from "./ConnectButton";

describe("accountInitials", () => {
  it("takes the two hex digits after 0x, ignoring checksum case", () => {
    expect(accountInitials("0x7A4fC2e1000000000000000000000000000000c2", undefined)).toBe("7a");
  });

  it("prefers the Ethereum account over the shielded address", () => {
    expect(accountInitials("0x9b00000000000000000000000000000000000000", "lelantos1qx8f")).toBe(
      "9b",
    );
  });

  // Every shielded address starts `lelantos1`; initials from the prefix would be
  // the same for everyone.
  it("reads a passkey session's shielded address past its prefix", () => {
    expect(accountInitials(undefined, "lelantos1q9x8fk2mzp4v7n0")).toBe("q9");
  });

  it("is empty with nothing to read", () => {
    expect(accountInitials(undefined, undefined)).toBe("");
  });
});
