import { describe, expect, it } from "vitest";
import { isUnrecognizedChain } from "./errors";

describe("isUnrecognizedChain", () => {
  it("reads the bare code the spec describes", () => {
    expect(isUnrecognizedChain({ code: 4902 })).toBe(true);
    expect(isUnrecognizedChain({ code: "4902" })).toBe(true);
  });

  it("unwraps the generic -32603 MetaMask and Rabby wrap it in", () => {
    // Wallets built on `rpc-errors` nest the real code under `data.originalError`.
    expect(
      isUnrecognizedChain({
        code: -32603,
        message: "Internal JSON-RPC error.",
        data: { originalError: { code: 4902 } },
      }),
    ).toBe(true);
  });

  it("falls back to the message for wallets that send no usable code", () => {
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
});
