import { describe, expect, it } from "vitest";
import type { ShieldedActions } from "./port";
import { requireActions } from "./use-shielded-actions";

describe("requireActions", () => {
  it("throws when actions are undefined", () => {
    expect(() => requireActions(undefined)).toThrow(/wallet not ready/);
  });

  it("returns the actions when present", () => {
    // Sentinel implementation: only object identity is asserted, so the cast
    // through `unknown` stands in for full per-kind SDK result fixtures.
    const a = {
      deposit: async () => ({ txHash: "x" }),
      transfer: async () => ({ txHash: "x" }),
      withdraw: async () => ({ txHash: "x" }),
      withdrawEth: async () => ({ txHash: "x" }),
      swap: async () => ({ txHash: "x" }),
    } as unknown as ShieldedActions;
    expect(requireActions(a)).toBe(a);
  });
});
