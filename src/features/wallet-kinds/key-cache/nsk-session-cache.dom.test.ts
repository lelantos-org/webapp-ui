// The cache holds raw spending keys, so what clears it is a security boundary.

import type { Field } from "@lelantos-org/sdk/primitives";
import { beforeEach, describe, expect, it } from "vitest";
import { accountDigest } from "@/shared/lib/storage/digest";
import { cacheNsk, clearAllCachedNsk, clearCachedNsk, getCachedNsk } from "./nsk-session-cache";

const ADDR_A = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaa1";
const ADDR_B = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbb1";

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
    const key = `lelantos:nsk:v1:${accountDigest(ADDR_A)}`;
    sessionStorage.setItem(key, "not-hex");

    expect(getCachedNsk(ADDR_A)).toBeUndefined();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  /// Key names must not spell out the account, or enumerating storage reveals connected accounts.
  it("keeps the address out of the key name", () => {
    cacheNsk(ADDR_A, nsk(1n));

    const keys = Object.keys(sessionStorage);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(ADDR_A.toLowerCase());
    expect(keys[0]).not.toContain(ADDR_A.slice(2).toLowerCase());
    expect(keys[0]).toContain(accountDigest(ADDR_A));
  });

  it("clearCachedNsk removes only the named account", () => {
    cacheNsk(ADDR_A, nsk(1n));
    cacheNsk(ADDR_B, nsk(2n));

    clearCachedNsk(ADDR_A);

    expect(getCachedNsk(ADDR_A)).toBeUndefined();
    expect(getCachedNsk(ADDR_B)).toBe(2n);
  });
});
