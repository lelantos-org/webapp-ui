import { describe, expect, it } from "vitest";
import { namesClient } from "./client";

describe("namesClient", () => {
  it("shares one client per read endpoint", () => {
    const a = namesClient({ readRpcUrl: "http://localhost:8545" });
    expect(namesClient({ readRpcUrl: "http://localhost:8545" })).toBe(a);
    expect(namesClient({ readRpcUrl: "http://localhost:9545" })).not.toBe(a);
  });

  it("carries no account", () => {
    expect(namesClient({ readRpcUrl: "http://localhost:8545" }).account).toBeUndefined();
  });
});
