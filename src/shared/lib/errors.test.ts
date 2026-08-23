import {
  DepositAdapterError,
  InsufficientCoverError,
  NetworkError,
  PermitRejectedError,
  ProverArtifactsFailedError,
  ProverArtifactsMissingError,
  ProverError,
  SelectionError,
  TxMiningError,
  WalletConfigError,
} from "@lelantos-org/sdk/errors";
import { describe, expect, it } from "vitest";
import { classifyError, describeError, friendlyMessage, isDuplicateSpend } from "./errors";

/// What the relayer answers a spend whose nullifier it has seen: 409 plus the
/// reason as the body. See `nullifier_guard.rs`.
const spendConflict = (body: string) =>
  new NetworkError("RELAYER_FAILED", "/relayer/v1/spend", "HTTP 409", { status: 409, body });

describe("describeError", () => {
  it("string fallback for raw values", () => {
    expect(describeError("boom")).toBe("boom");
  });

  it("Error fallback uses message", () => {
    expect(describeError(new Error("nope"))).toBe("nope");
  });

  it("reads the message off an EIP-1193 rejection", () => {
    // Wallets reject with a plain object, not an `Error`. Falling through to
    // `String(e)` rendered every one of them as "[object Object]".
    expect(describeError({ code: 4902, message: 'Unrecognized chain ID "0x7a69".' })).toBe(
      'Unrecognized chain ID "0x7a69".',
    );
  });

  it("names the code when the wallet sent no message", () => {
    // "-32603" in a bug report can be looked up; "[object Object]" cannot.
    expect(describeError({ code: -32603 })).toBe("Wallet error -32603");
  });

  it("prefers the innermost message over the generic wrapper", () => {
    expect(
      describeError({
        code: -32603,
        message: "Internal JSON-RPC error.",
        data: { originalError: { code: 4001, message: "User rejected the request." } },
      }),
    ).toBe("User rejected the request.");
  });

  it("keeps the unknown-network line out of the hex guard", () => {
    // The wallet names the chain in hex, which the generic `0x` guard would
    // otherwise flatten to "Something went wrong".
    expect(
      friendlyMessage({
        code: -32603,
        message: 'Unrecognized chain ID "0x7a69". Try adding the chain first.',
      }),
    ).toBe("Your wallet does not have this network. Add it in the wallet, then retry.");
  });

  it("InsufficientCoverError mentions consolidation", () => {
    const err = new InsufficientCoverError({
      target: 100n,
      asset: 1n,
      consolidate: [
        { id: 1, asset: 1n, value: 10n } as never,
        { id: 2, asset: 1n, value: 20n } as never,
      ],
      consolidateSum: 30n,
    });
    const msg = describeError(err);
    expect(msg).toMatch(/Insufficient cover/);
    expect(msg).toMatch(/Consolidate 2/);
  });

  it.each([
    [new NetworkError("RELAYER_TIMEOUT", "/r", "x"), /Relayer timed out/],
    [new NetworkError("RELAYER_FAILED", "/r", "x"), /Relayer rejected/],
    [new NetworkError("FMD_TIMEOUT", "/f", "x"), /FMD\) timed out/],
    [new NetworkError("FMD_FAILED", "/f", "x"), /FMD\) request failed/],
    [new ProverError("x"), /Proof generation failed/],
    [new PermitRejectedError(), /Signature rejected/],
    [new WalletConfigError("missing rpcUrl"), /Wallet misconfigured/],
    [new DepositAdapterError("native", ["submitIntentNative"]), /Wallet adapter cannot satisfy/],
    [new TxMiningError("no receipt"), /Transaction did not mine/],
    [new SelectionError("no spendable notes"), /no spendable notes/],
  ])("maps %s", (err, re) => {
    expect(describeError(err)).toMatch(re);
  });
});

describe("prover faults keep their own diagnosis", () => {
  // Every curated prover line contains the word "prover", so the keyword pass
  // used to rewrite all of them into "Proof generation failed" — the one fault
  // an unreachable or 404ing zkey is not.
  it("a missing artifact is not reported as a failed proof", () => {
    const msg = friendlyMessage(new ProverArtifactsMissingError(["opts.cdn"], "3x3"));
    expect(msg).toMatch(/artifacts missing/i);
    expect(msg).not.toMatch(/Proof generation failed/);
  });

  it("an artifact that failed to download points at the connection", () => {
    const msg = friendlyMessage(
      new ProverArtifactsFailedError("/3x3_final.zkey", "HTTP 404", { retryable: false }),
    );
    expect(msg).toMatch(/failed to load/i);
    expect(msg).not.toMatch(/Proof generation failed/);
  });

  it("a real prover failure still reads as one", () => {
    expect(friendlyMessage(new ProverError("witness calculation failed"))).toMatch(
      /Proof generation failed/,
    );
  });
});

describe("notes tied up in an earlier spend", () => {
  it("reads as a wait, not as an empty wallet", () => {
    const err = new SelectionError(
      "no spendable notes for asset 1 (3 in store: 2 awaiting an earlier spend, 1 spent)",
      { asset: 1n },
    );
    expect(friendlyMessage(err)).toMatch(/tied up in an earlier spend/);
  });
});

describe("duplicate spend", () => {
  it("tells a spend still in flight apart from one already landed", () => {
    expect(describeError(spendConflict("nullifier in flight: chain 1"))).toMatch(/Wait for it/);
    expect(describeError(spendConflict("nullifier already spent: chain 1 (1 hit)"))).toMatch(
      /already spent/,
    );
  });

  it("survives a relayer that sent no body", () => {
    expect(describeError(spendConflict(""))).toMatch(/already spent/);
  });

  it("keeps the advice through friendlyMessage, which flattens 'relayer' to one line", () => {
    expect(friendlyMessage(spendConflict("nullifier in flight: chain 1"))).toMatch(/Wait for it/);
  });

  it("is only a duplicate spend on 409", () => {
    expect(isDuplicateSpend(spendConflict("nullifier in flight: chain 1"))).toBe(true);
    expect(
      isDuplicateSpend(
        new NetworkError("RELAYER_FAILED", "/r", "HTTP 500", { status: 500, body: "boom" }),
      ),
    ).toBe(false);
    expect(isDuplicateSpend(new Error("HTTP 409"))).toBe(false);
  });
});

describe("classifyError", () => {
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
    // The same nesting that hid `4902` from `switchChain` hid `4001` here, so a
    // cancelled prompt was reported — and logged — as a hard failure.
    expect(
      classifyError({
        code: -32603,
        message: "Internal JSON-RPC error.",
        data: { originalError: { code: 4001, message: "User rejected the request." } },
      }).kind,
    ).toBe("rejected");
  });

  it("does not read the relayer's own refusal as a user cancellation", () => {
    // `describeError` renders a relayer 500 as "Relayer rejected the request…",
    // which a bare "rejected the request" match claimed as a cancellation — so
    // a server fault showed "Canceled in wallet." and, because cancellations
    // are deliberately not logged, left no record at all.
    const serverFault = new NetworkError("RELAYER_FAILED", "/relayer/v1/spend", "HTTP 500", {
      status: 500,
    });
    expect(classifyError(serverFault).kind).toBe("failed");
  });
});

describe("friendlyMessage hex guard", () => {
  it("passes through a message naming a chain id", () => {
    // A bare `includes("0x")` swallowed this, so every wallet line naming a
    // chain in hex needed its own curated branch to escape.
    expect(friendlyMessage(new Error('Chain "0x7a69" is not available.'))).toBe(
      'Chain "0x7a69" is not available.',
    );
  });

  it("still withholds a raw selector or address", () => {
    expect(friendlyMessage(new Error("call to 0x1e4fbdf7abcdef0123456789 did not complete"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
