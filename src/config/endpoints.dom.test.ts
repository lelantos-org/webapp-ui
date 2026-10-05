import { afterEach, describe, expect, it, vi } from "vitest";
import { reloadPage } from "@/shared/lib/reload";
import { applyEndpointOverrides, endpointUrl, readEndpointOverrides } from "./endpoints";

vi.mock("@/shared/lib/reload", () => ({ reloadPage: vi.fn() }));

const KEY = "lelantos:endpoints:v1";

/// The rule a shipped build applies.
const shipped = endpointUrl();
const accepts = (value: string) => shipped.safeParse(value).success;
const refusal = (value: string) => {
  const result = shipped.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
};

afterEach(() => {
  localStorage.removeItem(KEY);
  vi.mocked(reloadPage).mockClear();
});

describe("endpointUrl", () => {
  it("accepts https anywhere", () => {
    expect(shipped.parse("https://relayer.example.com")).toBe("https://relayer.example.com");
    expect(shipped.parse("https://example.com/relayer")).toBe("https://example.com/relayer");
  });

  it("accepts plain http on this machine only, as the shipped CSP does", () => {
    expect(accepts("http://localhost:3003")).toBe(true);
    expect(accepts("http://127.0.0.1:3001/fmd")).toBe(true);
    expect(refusal("http://relayer.example.com")).toBe("must be https, or http on localhost");
    // A CSP host source cannot name an IPv6 literal.
    expect(accepts("http://[::1]:3003")).toBe(false);
  });

  it("lets a development build name any http host", () => {
    const dev = endpointUrl({ allowAnyHttp: true });
    expect(dev.parse("http://relayer.example.com")).toBe("http://relayer.example.com");
  });

  it("resolves a path against this app", () => {
    expect(shipped.parse("/relayer")).toBe(new URL("/relayer", location.href).href);
  });

  it("refuses a bare host name rather than reading it as a path on this app", () => {
    expect(refusal("relayer.example.com")).toBe("must start with https:// or /");
  });

  it.each([
    ["credentials", "https://user:pw@relayer.example.com"],
    ["a query", "https://relayer.example.com/?key=1"],
    ["a fragment", "https://relayer.example.com/#top"],
  ])("refuses %s, which would break the paths built on it", (_what, value) => {
    expect(refusal(value)).toBe("must not carry credentials, a query or a fragment");
  });

  it.each([
    ["javascript:alert(1)"],
    ["ftp://relayer.example.com"],
    ["https://[bad"],
    [""],
  ])("refuses %j without throwing", (value) => {
    expect(accepts(value)).toBe(false);
  });

  it("gives one server one spelling", () => {
    expect(shipped.parse("  HTTPS://Fmd.Example.com/  ")).toBe("https://fmd.example.com");
    expect(shipped.parse("https://fmd.example.com:443/base/")).toBe("https://fmd.example.com/base");
    // An empty query or fragment is not one, and must not reach the paths built on the URL.
    expect(shipped.parse("https://fmd.example.com/?#")).toBe("https://fmd.example.com");
  });
});

describe("stored endpoint overrides", () => {
  it("are none until the user chooses one", () => {
    expect(readEndpointOverrides()).toEqual({});
  });

  it("are stored, then put in force by a reload", () => {
    const chosen = { relayerUrl: "https://relayer.example.com", rpcProxyUrl: "https://rpc.test" };
    expect(applyEndpointOverrides(chosen)).toBe(true);
    expect(readEndpointOverrides()).toEqual(chosen);
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("leave out a field that is not a usable URL, keeping the others", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        registryUrl: "javascript:alert(1)",
        relayerUrl: "https://relayer.example.com/",
        fmdUrl: 7,
        unknown: "https://elsewhere.example.com",
      }),
    );
    expect(readEndpointOverrides()).toEqual({ relayerUrl: "https://relayer.example.com" });
  });

  it.each([
    ["{not json"],
    ["[]"],
    ["null"],
    ['"https://relayer.example.com"'],
  ])("are none when the entry is %j", (raw) => {
    localStorage.setItem(KEY, raw);
    expect(readEndpointOverrides()).toEqual({});
  });

  it("are forgotten when none is applied", () => {
    applyEndpointOverrides({ fmdUrl: "https://fmd.example.com" });
    expect(applyEndpointOverrides({})).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("are not reloaded into when the browser refused the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(applyEndpointOverrides({ fmdUrl: "https://fmd.example.com" })).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
  });
});
