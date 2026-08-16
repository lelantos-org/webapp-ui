import { describe, expect, it } from "vitest";
import { Schema } from "./env";

const ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266";

/// The minimum a build must supply; everything else has a default or is
/// optional.
const required = {
  rpcUrl: "http://localhost:8545",
  relayerUrl: "/relayer",
  fmdUrl: "/fmd",
  relayerAddress: ADDR,
};

describe("env Schema", () => {
  it("parses a minimal config and applies defaults", () => {
    const env = Schema.parse(required);
    expect(env.chainId).toBe(31337n);
    expect(env.chainName).toBe("local");
    expect(env.treeDepth).toBe(20);
    expect(env.explorerApiUrl).toBe(new URL("/explorer", location.href).href);
    expect(env.metaquoterUrl).toBeUndefined();
    expect(env.swapWrapperAddress).toBeUndefined();
    expect(env.nativeAdapterAddress).toBeUndefined();
  });

  // Absent means the SDK cannot reach `NativeAdapter`, so the UI withholds
  // the native-ETH option rather than failing at submit.
  it("treats a blank native adapter address as absent", () => {
    expect(
      Schema.parse({ ...required, nativeAdapterAddress: "" }).nativeAdapterAddress,
    ).toBeUndefined();
    expect(Schema.parse({ ...required, nativeAdapterAddress: ADDR }).nativeAdapterAddress).toBe(
      ADDR,
    );
  });

  // The SDK's HTTP client builds requests with `new URL(base + path)`, which
  // throws on a page-relative base. Deployments configure proxy paths, so the
  // schema has to resolve them.
  it("resolves proxy-relative service URLs against the page origin", () => {
    const env = Schema.parse({
      ...required,
      relayerUrl: "/relayer",
      fmdUrl: "/fmd",
      metaquoterUrl: "/metaquoter",
      explorerApiUrl: "/explorer",
    });
    // `new URL(base + path)` is what the SDK client does; it must not throw.
    expect(() => new URL(`${env.fmdUrl}/v1/notes`)).not.toThrow();
    expect(env.fmdUrl).toBe(new URL("/fmd", location.href).href);
    expect(env.relayerUrl).toBe(new URL("/relayer", location.href).href);
    expect(env.metaquoterUrl).toBe(new URL("/metaquoter", location.href).href);
    expect(env.explorerApiUrl).toBe(new URL("/explorer", location.href).href);
  });

  it("leaves an already-absolute service URL untouched", () => {
    const env = Schema.parse({
      ...required,
      relayerUrl: "https://relayer.example.com",
      fmdUrl: "https://fmd.example.com",
    });
    expect(env.relayerUrl).toBe("https://relayer.example.com");
    expect(env.fmdUrl).toBe("https://fmd.example.com");
  });

  it("brands addresses so consumers need not re-validate", () => {
    const env = Schema.parse({ ...required, maspAddress: ADDR });
    expect(env.relayerAddress).toBe(ADDR);
    expect(env.maspAddress).toBe(ADDR);
  });

  // Unset Docker build args and CI variables arrive as "" rather than
  // undefined. Blank must disable the feature, not fail the whole parse.
  it("treats a blank optional setting as absent", () => {
    const env = Schema.parse({
      ...required,
      maspAddress: "",
      permit2Address: "",
      metaquoterUrl: "",
      swapWrapperAddress: "",
      explorerUrl: "",
    });
    expect(env.maspAddress).toBeUndefined();
    expect(env.permit2Address).toBeUndefined();
    expect(env.metaquoterUrl).toBeUndefined();
    expect(env.swapWrapperAddress).toBeUndefined();
    expect(env.explorerUrl).toBeUndefined();
  });

  it("falls back to defaults when a defaulted setting is blank", () => {
    const env = Schema.parse({
      ...required,
      chainId: "",
      chainName: "",
      treeDepth: "",
      explorerApiUrl: "",
    });
    expect(env.chainId).toBe(31337n);
    expect(env.chainName).toBe("local");
    expect(env.treeDepth).toBe(20);
    expect(env.explorerApiUrl).toBe(new URL("/explorer", location.href).href);
  });

  it("honours supplied overrides", () => {
    const env = Schema.parse({ ...required, chainId: "1", treeDepth: "32" });
    expect(env.chainId).toBe(1n);
    expect(env.treeDepth).toBe(32);
  });

  it("still rejects a required setting left blank", () => {
    expect(() => Schema.parse({ ...required, rpcUrl: "" })).toThrow();
    expect(() => Schema.parse({ ...required, relayerAddress: "" })).toThrow();
  });

  it("rejects a malformed address rather than silently dropping it", () => {
    expect(() => Schema.parse({ ...required, maspAddress: "0xdead" })).toThrow();
    expect(() => Schema.parse({ ...required, relayerAddress: "nope" })).toThrow();
  });

  it("rejects a non-positive tree depth", () => {
    expect(() => Schema.parse({ ...required, treeDepth: "0" })).toThrow();
    expect(() => Schema.parse({ ...required, treeDepth: "-1" })).toThrow();
  });
});
