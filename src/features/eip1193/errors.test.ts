import { describe, expect, it } from "vitest";
import { isUnrecognizedChain } from "./errors";

describe("isUnrecognizedChain", () => {
  it("reads the bare code the spec describes", () => {
    expect(isUnrecognizedChain({ code: 4902 })).toBe(true);
    expect(isUnrecognizedChain({ code: "4902" })).toBe(true);
  });

  it("unwraps the generic -32603 MetaMask and Rabby wrap it in", () => {
    // Both build on the same `rpc-errors` package, so the real code sits under
    // `data.originalError` and the top-level one is a useless "internal error".
    // Reading only the top level skipped `wallet_addEthereumChain` entirely.
    expect(
      isUnrecognizedChain({
        code: -32603,
        message: "Internal JSON-RPC error.",
        data: { originalError: { code: 4902 } },
      }),
    ).toBe(true);
  });

  it("also finds a code placed directly under data", () => {
    expect(isUnrecognizedChain({ code: -32603, data: { code: 4902 } })).toBe(true);
  });

  it("falls back to the message for wallets that send no usable code", () => {
    // Verbatim from the incident: Rabby on Anvil (0x7a69 = 31337).
    expect(
      isUnrecognizedChain({
        code: -32603,
        message:
          'Unrecognized chain ID "0x7a69". Try adding the chain using wallet_switchEthereumChain first.',
      }),
    ).toBe(true);
  });

  it("leaves every other failure alone", () => {
    expect(isUnrecognizedChain({ code: 4001, message: "User rejected the request." })).toBe(false);
    expect(isUnrecognizedChain(new Error("boom"))).toBe(false);
    expect(isUnrecognizedChain(null)).toBe(false);
    expect(isUnrecognizedChain(undefined)).toBe(false);
  });

  it("terminates on a self-referential error object", () => {
    // `data` is wallet-supplied; an unbounded walk over it would hang the tab.
    const cyclic: { code: number; data?: unknown } = { code: -32603 };
    cyclic.data = { originalError: cyclic };
    expect(isUnrecognizedChain(cyclic)).toBe(false);
  });
});
