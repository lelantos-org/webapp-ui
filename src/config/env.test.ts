import { describe, expect, it } from "vitest";
import { Schema } from "./env";

/// The whole surface now: three service URLs, two of them mandatory. Every
/// per-chain value comes from the relayer's `/chains` at runtime.
const required = {
  relayerUrl: "/relayer",
  fmdUrl: "/fmd",
};

describe("env Schema", () => {
  it("parses a minimal config", () => {
    const env = Schema.parse(required);
    expect(env.relayerUrl).toBe(new URL("/relayer", location.href).href);
    expect(env.fmdUrl).toBe(new URL("/fmd", location.href).href);
    expect(env.metaquoterUrl).toBeUndefined();
  });

  // The SDK's HTTP client builds requests with `new URL(base + path)`, which
  // throws on a page-relative base. Deployments configure proxy paths, so the
  // schema has to resolve them.
  it("resolves proxy-relative service URLs against the page origin", () => {
    const env = Schema.parse({ ...required, metaquoterUrl: "/metaquoter" });
    expect(() => new URL(`${env.fmdUrl}/v1/notes`)).not.toThrow();
    expect(env.relayerUrl).toBe(new URL("/relayer", location.href).href);
    expect(env.fmdUrl).toBe(new URL("/fmd", location.href).href);
    expect(env.metaquoterUrl).toBe(new URL("/metaquoter", location.href).href);
  });

  it("keeps absolute service URLs untouched", () => {
    const env = Schema.parse({
      relayerUrl: "https://relayer.example.com",
      fmdUrl: "https://fmd.example.com",
    });
    expect(env.relayerUrl).toBe("https://relayer.example.com");
    expect(env.fmdUrl).toBe("https://fmd.example.com");
  });

  // An unset Docker build arg reaches Vite as "" rather than undefined, so
  // blank has to mean absent — otherwise declaring an optional setting
  // without a value would fail the boot instead of switching its feature off.
  it("treats a blank metaquoter URL as absent, disabling swaps", () => {
    expect(Schema.parse({ ...required, metaquoterUrl: "" }).metaquoterUrl).toBeUndefined();
  });

  it.each([["relayerUrl"], ["fmdUrl"]])("rejects a config with no %s", (field) => {
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
    expect(Schema.safeParse({ relayerUrl: "htp://relayer", fmdUrl: "/fmd" }).success).toBe(false);
    expect(Schema.safeParse({ relayerUrl: " ", fmdUrl: "/fmd" }).success).toBe(false);
  });

  it("still accepts page-relative paths, which deployments use", () => {
    const parsed = Schema.parse({ relayerUrl: "/relayer", fmdUrl: "/fmd" });
    expect(parsed.relayerUrl).toMatch(/^https?:\/\//);
  });

  it("rejects a malformed optional URL rather than silently disabling the feature", () => {
    expect(
      Schema.safeParse({ relayerUrl: "/relayer", fmdUrl: "/fmd", metaquoterUrl: "nope://x" })
        .success,
    ).toBe(false);
  });

  it("treats a blank optional as absent", () => {
    expect(
      Schema.parse({ relayerUrl: "/relayer", fmdUrl: "/fmd", metaquoterUrl: "" }).metaquoterUrl,
    ).toBeUndefined();
  });
});
