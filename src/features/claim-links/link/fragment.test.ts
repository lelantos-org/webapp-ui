import { describe, expect, it, vi } from "vitest";
import { NSK_HEX_LEN } from "@/features/wallet-kinds";
import { readFragmentFromHash, scrubLocationHash } from "./fragment";

const NSK = "a".repeat(NSK_HEX_LEN);
const VALID = `7a69:${NSK}`;

describe("readFragmentFromHash", () => {
  it("reads the key and the chain from a valid fragment", () => {
    expect(readFragmentFromHash(`#${VALID}`)).toEqual({
      ok: true,
      value: expect.objectContaining({ nskHex: NSK, chainId: 31337n }),
    });
  });

  it.each([
    ["an empty hash", "", "missing", undefined],
    ["a bare '#'", "#", "missing", undefined],
    ["a bad key behind a good chain prefix", "#7a69:nothex", "invalid", /64 hex/],
    ["a link with no chain prefix", `#${NSK}`, "invalid", /chain prefix/],
  ])("reports %s", (_label, hash, kind, message) => {
    const r = readFragmentFromHash(hash);
    if (r.ok) throw new Error("read an unusable fragment");
    expect(r.error.kind).toBe(kind);
    if (message) expect(r.error.message).toMatch(message);
  });
});

describe("scrubLocationHash", () => {
  const scrub = (pathname: string, hash: string) => {
    const replaceState = vi.fn();
    scrubLocationHash({ pathname, hash } as Location, { replaceState } as unknown as History);
    return replaceState;
  };

  // A trailing slash must not leave the bearer secret in the address bar.
  it.each(["/claim", "/claim/"])("drops the secret from %s, keeping the path", (pathname) => {
    expect(scrub(pathname, "#secret")).toHaveBeenCalledWith(null, "", pathname);
  });

  it.each([
    ["an unrelated path", "/transfer", "#x"],
    ["a claim page with no hash", "/claim", ""],
  ])("leaves %s alone", (_label, pathname, hash) => {
    expect(scrub(pathname, hash)).not.toHaveBeenCalled();
  });
});
