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
