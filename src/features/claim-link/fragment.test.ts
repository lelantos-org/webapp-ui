import { describe, expect, it, vi } from "vitest";
import { NSK_HEX_LEN } from "./codec";
import { readFragmentFromHash, scrubLocationHash } from "./fragment";

const NSK = "a".repeat(NSK_HEX_LEN);
/// Links now carry the chain they were made on; `7a69` is 31337.
const VALID = `7a69:${NSK}`;

describe("readFragmentFromHash", () => {
  it("returns missing for empty hash", () => {
    const r = readFragmentFromHash("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("missing");
  });

  it("returns missing for bare '#'", () => {
    const r = readFragmentFromHash("#");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("missing");
  });

  it("returns ok for valid fragment", () => {
    const r = readFragmentFromHash(`#${VALID}`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.nskHex).toBe(NSK);
      expect(r.value.chainId).toBe(31337n);
    }
  });

  it("returns invalid for a bad nsk behind a good chain prefix", () => {
    const r = readFragmentFromHash("#7a69:nothex");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("invalid");
      expect(r.error.message).toMatch(/64 hex/);
    }
  });

  it("returns invalid for a link with no chain prefix", () => {
    const r = readFragmentFromHash(`#${NSK}`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("invalid");
      expect(r.error.message).toMatch(/chain prefix/);
    }
  });
});

describe("scrubLocationHash", () => {
  it("replaces history when on /claim with hash", () => {
    const replace = vi.fn();
    const loc = { pathname: "/claim", hash: "#abc" } as Location;
    const hist = { replaceState: replace } as unknown as History;
    scrubLocationHash(loc, hist);
    expect(replace).toHaveBeenCalledWith(null, "", "/claim");
  });

  it("noop when not on /claim", () => {
    const replace = vi.fn();
    scrubLocationHash(
      { pathname: "/other", hash: "#abc" } as Location,
      { replaceState: replace } as unknown as History,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("noop when no hash", () => {
    const replace = vi.fn();
    scrubLocationHash(
      { pathname: "/claim", hash: "" } as Location,
      { replaceState: replace } as unknown as History,
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
