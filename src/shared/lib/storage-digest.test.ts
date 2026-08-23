// These digests exist to keep an EOA and a bearer key out of storage *key
// names*. What matters is that they are stable, non-reversible, and agree with
// the WebCrypto spelling the ephemeral note store used before.

import { describe, expect, it } from "vitest";
import { accountDigest, storageDigest } from "./storage-digest";

const ADDR = "0xAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaaaAAAAaaa1";
const OTHER = "0xBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbbbBBBBbbb1";

/// `sha256("abc")`, the standard test vector.
const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("storageDigest", () => {
  it("is SHA-256, truncated", () => {
    expect(storageDigest("abc")).toBe(SHA256_ABC.slice(0, 16));
  });

  /// `claimLink.ts` previously computed this with `crypto.subtle.digest` over
  /// `TextEncoder`-encoded bytes. Records written under that spelling must land
  /// in the same namespace, or a link's notes become unreachable.
  it("matches the WebCrypto spelling it replaced", async () => {
    const value = "deadbeef".repeat(8);
    const bytes = new TextEncoder().encode(value);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const viaSubtle = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );

    expect(storageDigest(value)).toBe(viaSubtle);
  });

  it("is a fixed-width lowercase hex string", () => {
    expect(storageDigest(ADDR)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("separates distinct inputs", () => {
    expect(storageDigest("a")).not.toBe(storageDigest("b"));
  });

  it("is case-sensitive", () => {
    expect(storageDigest("A")).not.toBe(storageDigest("a"));
  });
});

describe("accountDigest", () => {
  it("does not contain the address in any casing", () => {
    const d = accountDigest(ADDR);
    expect(d).not.toContain(ADDR);
    expect(d).not.toContain(ADDR.toLowerCase());
    expect(d).not.toContain(ADDR.slice(2).toLowerCase());
  });

  /// Providers disagree on casing — EIP-55 checksummed from one, lowercase from
  /// another. A digest that disagreed across those would strand a cached nsk
  /// behind a silent re-prompt for a signature.
  it("is case-insensitive", () => {
    expect(accountDigest(ADDR)).toBe(accountDigest(ADDR.toLowerCase()));
    expect(accountDigest(ADDR)).toBe(accountDigest(`0x${ADDR.slice(2).toUpperCase()}`));
  });

  it("separates distinct accounts", () => {
    expect(accountDigest(ADDR)).not.toBe(accountDigest(OTHER));
  });
});
