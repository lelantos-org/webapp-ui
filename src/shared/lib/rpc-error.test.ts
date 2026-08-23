import { describe, expect, it } from "vitest";
import { hasRpcCode, rpcErrorChain, rpcErrorMessage } from "@/shared/lib/rpc-error";

/// The shape MetaMask and Rabby actually send, via the `rpc-errors` package.
const wrapped = {
  code: -32603,
  message: "Internal JSON-RPC error.",
  data: { originalError: { code: 4001, message: "User rejected the request." } },
};

describe("rpcErrorChain", () => {
  it("walks originalError, then data, outermost first", () => {
    expect(rpcErrorChain(wrapped).map((n) => n.code)).toEqual([-32603, 4001]);
    expect(rpcErrorChain({ code: 1, data: { code: 2 } }).map((n) => n.code)).toEqual([1, 2]);
  });

  it("is empty for values that carry no wallet shape", () => {
    expect(rpcErrorChain(null)).toEqual([]);
    expect(rpcErrorChain(undefined)).toEqual([]);
    expect(rpcErrorChain("boom")).toEqual([]);
  });

  it("stops rather than spinning on a cycle", () => {
    const cyclic: { code: number; data?: unknown } = { code: -32603 };
    cyclic.data = { originalError: cyclic };
    expect(rpcErrorChain(cyclic).length).toBeLessThanOrEqual(4);
  });
});

describe("hasRpcCode", () => {
  it("finds a code at any depth", () => {
    expect(hasRpcCode(wrapped, 4001)).toBe(true);
    expect(hasRpcCode(wrapped, -32603)).toBe(true);
    expect(hasRpcCode(wrapped, 4902)).toBe(false);
  });

  it("matches the numeric and string spellings wallets both use", () => {
    expect(hasRpcCode({ code: "4902" }, 4902)).toBe(true);
    expect(hasRpcCode({ code: "ACTION_REJECTED" }, 4001, "ACTION_REJECTED")).toBe(true);
  });

  it("does not treat a missing code as a match", () => {
    expect(hasRpcCode({ message: "nope" }, 4001)).toBe(false);
    // `Number(undefined)` is NaN and `Number(null)` is 0 — neither may sneak in.
    expect(hasRpcCode({ code: null }, 0)).toBe(false);
  });
});

describe("rpcErrorMessage", () => {
  it("prefers the innermost message over the generic wrapper", () => {
    // "Internal JSON-RPC error." is what the user used to be told; the line
    // worth showing is one level down.
    expect(rpcErrorMessage(wrapped)).toBe("User rejected the request.");
  });

  it("falls back to the outer message when nothing is nested", () => {
    expect(rpcErrorMessage({ code: 4902, message: "Unrecognized chain." })).toBe(
      "Unrecognized chain.",
    );
  });

  it("is undefined when no layer carries one", () => {
    expect(rpcErrorMessage({ code: -32603 })).toBeUndefined();
    expect(rpcErrorMessage({ code: -32603, message: "" })).toBeUndefined();
    expect(rpcErrorMessage(null)).toBeUndefined();
  });
});
