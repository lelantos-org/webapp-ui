// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Schema } from "./env";

/// The whole surface now: four service URLs, three of them mandatory. Every
/// per-chain value comes from protocol-webserver's `/v1/chains` and the
/// relayer's `/chains` at runtime.
const required = {
  registryUrl: "/registry",
  relayerUrl: "/relayer",
  fmdUrl: "/fmd",
};

describe("env Schema", () => {
  // The SDK's HTTP client builds requests with `new URL(base + path)`, which
  // throws on a page-relative base. Deployments configure proxy paths, so the
  // schema has to resolve them.
  it("resolves proxy-relative service URLs against the page origin", () => {
    const minimal = Schema.parse(required);
    expect(minimal.relayerUrl).toBe(new URL("/relayer", location.href).href);
    expect(minimal.metaquoterUrl).toBeUndefined();

    const env = Schema.parse({ ...required, metaquoterUrl: "/metaquoter" });
    expect(() => new URL(`${env.fmdUrl}/v1/notes`)).not.toThrow();
    expect(env.fmdUrl).toBe(new URL("/fmd", location.href).href);
    expect(env.metaquoterUrl).toBe(new URL("/metaquoter", location.href).href);
  });

  it("keeps absolute service URLs untouched", () => {
    const env = Schema.parse({
      registryUrl: "https://registry.example.com",
      relayerUrl: "https://relayer.example.com",
      fmdUrl: "https://fmd.example.com",
    });
    expect(env.registryUrl).toBe("https://registry.example.com");
    expect(env.relayerUrl).toBe("https://relayer.example.com");
    expect(env.fmdUrl).toBe("https://fmd.example.com");
  });

  // An unset Docker build arg reaches Vite as "" rather than undefined, so
  // blank has to mean absent — otherwise declaring an optional setting
  // without a value would fail the boot instead of switching its feature off.
  it("treats a blank metaquoter URL as absent, disabling swaps", () => {
    expect(Schema.parse({ ...required, metaquoterUrl: "" }).metaquoterUrl).toBeUndefined();
  });

  // The registry and the relayer are both bootstraps and neither is derivable
  // from the other: the app cross-checks their two accounts of a chain, so a
  // deployment that sets only one has no usable network. Failing at boot says so
  // where a silent fallback would not.
  /// Every call site builds its request as `${env.someUrl}/v1/thing`, so a base
  /// carrying a trailing slash yields `//v1/thing` — a path some servers 404 and
  /// some proxies silently collapse, which is the worse of the two because it
  /// works in one deployment and not the next.
  it.each([
    ["/registry/"],
    ["https://registry.example.com/"],
    ["https://registry.example.com/base/"],
  ])("normalises %s so a templated path cannot double its slash", (raw) => {
    const env = Schema.parse({ ...required, registryUrl: raw });
    // Asserted as a property rather than against a rebuilt string: `new URL`
    // appends the root slash to a bare origin, so reconstructing the expected
    // value here would be testing `URL`'s normalisation rather than ours.
    expect(env.registryUrl.endsWith("/")).toBe(false);
    expect(`${env.registryUrl}/v1/prices`).not.toContain("//v1/prices");
  });

  it.each([
    ["registryUrl", "/registry/", "/registry"],
    ["metaquoterUrl", "/metaquoter/", "/metaquoter"],
  ] as const)("strips only the trailing slash from %s, leaving its path", (field, raw, path) => {
    expect(Schema.parse({ ...required, [field]: raw })[field]).toBe(
      new URL(path, location.href).href,
    );
  });

  it.each([["registryUrl"], ["relayerUrl"], ["fmdUrl"]])("rejects a config with no %s", (field) => {
    const raw: Record<string, string> = { ...required };
    delete raw[field];
    expect(() => Schema.parse(raw)).toThrow();
  });
});

describe("service URL validation", () => {
  it("rejects a value that does not resolve to an http(s) URL", () => {
    // `z.string().min(1)` accepted these. Both resolve against the page origin
    // without complaint and then fail every call at runtime, surfacing deep in
    // the app instead of at boot where the misconfiguration actually is.
    expect(Schema.safeParse({ ...required, relayerUrl: "htp://relayer" }).success).toBe(false);
    expect(Schema.safeParse({ ...required, relayerUrl: " " }).success).toBe(false);
    expect(Schema.safeParse({ ...required, registryUrl: "htp://registry" }).success).toBe(false);
  });

  it("rejects a malformed optional URL rather than silently disabling the feature", () => {
    expect(Schema.safeParse({ ...required, metaquoterUrl: "nope://x" }).success).toBe(false);
  });
});
