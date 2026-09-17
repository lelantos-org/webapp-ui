import { describe, expect, it } from "vitest";
import { requireActions } from "./mutation";
import type { ShieldedActions } from "./sdk-adapter";

describe("requireActions", () => {
  it("throws when actions are undefined", () => {
    expect(() => requireActions(undefined)).toThrow(/wallet not ready/);
  });

  it("returns the actions when present", () => {
    const a = {
      deposit: async () => ({ txHash: "x" }),
      transfer: async () => ({ txHash: "x" }),
      withdraw: async () => ({ txHash: "x" }),
      swap: async () => ({ txHash: "x" }),
    } as unknown as ShieldedActions;
    expect(requireActions(a)).toBe(a);
  });
});
