// The cache holds raw shielded spending keys for the tab's lifetime, so what
// clears it — and when — is the security boundary, not a housekeeping detail.

import type { Field } from "@lelantos-org/sdk/crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheNsk,
  clearAllCachedNsk,
  clearCachedNsk,
  getCachedNsk,
} from "@/features/wallet/nsk-session-cache";

const ADDR_A = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaa1";
const ADDR_B = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbb1";

/// Any in-range field element; the codec round-trip is what is under test here,
/// not the value.
const nsk = (n: bigint): Field => n as unknown as Field;

beforeEach(() => {
  sessionStorage.clear();
});

describe("nsk session cache", () => {
  it("round-trips a key and is address-scoped", () => {
    cacheNsk(ADDR_A, nsk(42n));

    expect(getCachedNsk(ADDR_A)).toBe(42n);
    expect(getCachedNsk(ADDR_B)).toBeUndefined();
  });

  it("keys case-insensitively, so a checksummed address hits the same entry", () => {
    cacheNsk(ADDR_A, nsk(7n));

    expect(getCachedNsk(ADDR_A.toLowerCase())).toBe(7n);
  });

  it("clears every account, not just the connected one", () => {
    // A session that touched several accounts used to keep one raw spending key
    // per account after "disconnect", because only the current address was
    // cleared.
    cacheNsk(ADDR_A, nsk(1n));
    cacheNsk(ADDR_B, nsk(2n));

    clearAllCachedNsk();

    expect(getCachedNsk(ADDR_A)).toBeUndefined();
    expect(getCachedNsk(ADDR_B)).toBeUndefined();
  });

  it("leaves unrelated sessionStorage entries alone", () => {
    sessionStorage.setItem("unrelated", "keep me");
    cacheNsk(ADDR_A, nsk(1n));

    clearAllCachedNsk();

    expect(sessionStorage.getItem("unrelated")).toBe("keep me");
  });

  it("drops a malformed entry rather than returning it", () => {
    sessionStorage.setItem(`lelantos:nsk:${ADDR_A.toLowerCase()}`, "not-hex");

    expect(getCachedNsk(ADDR_A)).toBeUndefined();
    expect(sessionStorage.getItem(`lelantos:nsk:${ADDR_A.toLowerCase()}`)).toBeNull();
  });

  it("clearCachedNsk removes only the named account", () => {
    cacheNsk(ADDR_A, nsk(1n));
    cacheNsk(ADDR_B, nsk(2n));

    clearCachedNsk(ADDR_A);

    expect(getCachedNsk(ADDR_A)).toBeUndefined();
    expect(getCachedNsk(ADDR_B)).toBe(2n);
  });
});
