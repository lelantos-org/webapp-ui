import { describe, expect, it } from "vitest";
import { Schema } from "./env";

const required = {
  registryUrl: "/registry",
  relayerUrl: "/relayer",
  fmdUrl: "/fmd",
};

describe("env Schema", () => {
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

  it("treats a blank metaquoter URL as absent, disabling swaps", () => {
    expect(Schema.parse({ ...required, metaquoterUrl: "" }).metaquoterUrl).toBeUndefined();
  });

  it.each([
    ["/registry/"],
    ["https://registry.example.com/"],
    ["https://registry.example.com/base/"],
  ])("normalises %s so a templated path cannot double its slash", (raw) => {
    const env = Schema.parse({ ...required, registryUrl: raw });
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
    expect(Schema.safeParse({ ...required, relayerUrl: "htp://relayer" }).success).toBe(false);
    expect(Schema.safeParse({ ...required, relayerUrl: " " }).success).toBe(false);
    expect(Schema.safeParse({ ...required, registryUrl: "htp://registry" }).success).toBe(false);
  });

  it("rejects a malformed optional URL rather than silently disabling the feature", () => {
    expect(Schema.safeParse({ ...required, metaquoterUrl: "nope://x" }).success).toBe(false);
  });
});
