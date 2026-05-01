import {
  DepositAdapterError,
  InsufficientCoverError,
  NetworkError,
  PermitRejectedError,
  ProverError,
  SelectionError,
  TxMiningError,
  WalletConfigError,
} from "@lelantos-org/sdk/errors";
import { describe, expect, it } from "vitest";
import { describeError } from "./errors";

describe("describeError", () => {
  it("string fallback for raw values", () => {
    expect(describeError("boom")).toBe("boom");
  });

  it("Error fallback uses message", () => {
    expect(describeError(new Error("nope"))).toBe("nope");
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
