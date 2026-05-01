import { describe, expect, it, vi } from "vitest";
import { NSK_HEX_LEN } from "./codec";
import { readFragmentFromHash, scrubLocationHash } from "./fragment";

const VALID = "a".repeat(NSK_HEX_LEN);

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
    if (r.ok) expect(r.value.hex).toBe(VALID);
  });

  it("returns invalid for malformed fragment", () => {
    const r = readFragmentFromHash("#nothex");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("invalid");
      expect(r.error.message).toMatch(/64 hex/);
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
