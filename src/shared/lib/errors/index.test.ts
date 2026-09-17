import {
  ProverArtifactsFailedError,
  ProverArtifactsMissingError,
  ProverError,
  RelayerRejectedError,
  UserRejectedError,
} from "@lelantos-org/sdk";
import { describe, expect, it, vi } from "vitest";
import { CANCELED_IN_WALLET, classifyError, rawMessage, reportError, userMessage } from "./index";

const inFlight = () =>
  new RelayerRejectedError({
    status: 409,
    reason: "nullifier-in-flight",
    body: "nullifier in flight: chain 1",
  });

describe("rawMessage", () => {
  it("reads a raw string, or an Error's message", () => {
    expect(rawMessage("boom")).toBe("boom");
    expect(rawMessage(new Error("nope"))).toBe("nope");
  });

  it("reads the message off an EIP-1193 rejection", () => {
    expect(rawMessage({ code: 4902, message: 'Unrecognized chain ID "0x7a69".' })).toBe(
      'Unrecognized chain ID "0x7a69".',
    );
  });

  it("names the code when the wallet sent no message", () => {
    expect(rawMessage({ code: -32603 })).toBe("Wallet error -32603");
  });

  it("keeps the unknown-network line out of the hex guard", () => {
    expect(
      userMessage({
        code: -32603,
        message: 'Unrecognized chain ID "0x7a69". Try adding the chain first.',
      }),
    ).toBe("Your wallet does not have this network. Add it in the wallet, then retry.");
  });
});

describe("prover faults keep their own diagnosis", () => {
  it("a missing artifact is not reported as a failed proof", () => {
    const msg = userMessage(new ProverArtifactsMissingError(["opts.cdn"], "3x3"));
    expect(msg).toMatch(/artifacts missing/i);
    expect(msg).not.toMatch(/Proof generation failed/);
  });

  it("an artifact that failed to download points at the connection", () => {
    const msg = userMessage(
      new ProverArtifactsFailedError("/3x3_final.zkey", "HTTP 404", { retryable: false }),
    );
    expect(msg).toMatch(/failed to load/i);
    expect(msg).not.toMatch(/Proof generation failed/);
  });

  it("a real prover failure still reads as one", () => {
    expect(userMessage(new ProverError("witness calculation failed"))).toMatch(
      /Proof generation failed/,
    );
  });
});

describe("duplicate spend", () => {
  it("keeps the in-flight advice through userMessage", () => {
    expect(userMessage(inFlight())).toMatch(/Wait for it/);
  });
});

describe("classifyError", () => {
  it("treats the SDK's USER_REJECTED as a cancellation", () => {
    const declined = new UserRejectedError("send-tx");
    expect(classifyError(declined).kind).toBe("rejected");
    expect(userMessage(declined)).toBe(CANCELED_IN_WALLET);
  });

  it("treats a user cancellation as rejected, however the wallet spells it", () => {
    expect(classifyError({ code: 4001, message: "User rejected the request." }).kind).toBe(
      "rejected",
    );
    expect(classifyError({ code: "ACTION_REJECTED" }).kind).toBe("rejected");
    expect(classifyError(new Error("MetaMask Tx Signature: User denied transaction")).kind).toBe(
      "rejected",
    );
  });

  it("finds the cancellation code through the wrapper wallets add", () => {
    expect(
      classifyError({
        code: -32603,
        message: "Internal JSON-RPC error.",
        data: { originalError: { code: 4001, message: "User rejected the request." } },
      }).kind,
    ).toBe("rejected");
  });

  it("does not read the relayer's own refusal as a user cancellation", () => {
    const serverFault = new RelayerRejectedError({ status: 500, reason: "internal", body: "" });
    expect(rawMessage(serverFault)).toMatch(/rejected the request/);
    expect(classifyError(serverFault).kind).toBe("failed");
  });
});

describe("userMessage hex guard", () => {
  it("passes through a message naming a chain id", () => {
    expect(userMessage(new Error('Chain "0x7a69" is not available.'))).toBe(
      'Chain "0x7a69" is not available.',
    );
  });

  it("still withholds a raw selector or address", () => {
    expect(userMessage(new Error("call to 0x1e4fbdf7abcdef0123456789 did not complete"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});

describe("reportError", () => {
  it("words a cancellation like every other surface does, and does not log it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = reportError("test", { code: 4001, message: "User rejected the request." });

    expect(r).toEqual({ kind: "rejected", message: CANCELED_IN_WALLET });
    expect(userMessage({ code: 4001 })).toBe(CANCELED_IN_WALLET);
    expect(logged).not.toHaveBeenCalled();
  });

  it("shows the user's line and logs the raw cause", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new Error(`call failed with data 0x${"ab".repeat(40)}`);
    const r = reportError("test", raw);

    expect(r.kind).toBe("failed");
    expect(r.message).toBe("Something went wrong. Please try again.");
    expect(logged).toHaveBeenCalled();
    expect(logged.mock.calls.flat()).toContain(raw);
  });
});
