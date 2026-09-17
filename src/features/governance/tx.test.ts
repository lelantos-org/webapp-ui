import { evmAddress, type Hex32 } from "@lelantos-org/sdk";
import { encodeErrorResult, type TransactionReceipt } from "viem";
import { describe, expect, it, vi } from "vitest";
import { hexBytes32 } from "@/test/fixtures/addresses";
import { governorAbi } from "./abi";
import {
  GovernanceTxError,
  type GovTxDeps,
  governorErrorCode,
  revertData,
  sendGovernanceTx,
} from "./tx";

const GOVERNOR = evmAddress("0x5555555555555555555555555555555555555555");
const ME = evmAddress("0x1111111111111111111111111111111111111111");
const HASH = hexBytes32("cd");

const quorumVoteClosed = encodeErrorResult({
  abi: governorAbi,
  errorName: "QuorumVotingClosed",
  args: [7n, 1_240n],
});

/// How viem reports a reverted `eth_call`: the data two causes down.
const viemRevert = (data: string) => ({
  name: "CallExecutionError",
  cause: { name: "RawContractError", data },
});

function deps(over: Partial<GovTxDeps["client"]> = {}) {
  const send = vi.fn(async () => HASH as unknown as Hex32);
  const client = {
    call: vi.fn(async () => ({ data: undefined })),
    waitForTransactionReceipt: vi.fn(async () => ({ status: "success" }) as TransactionReceipt),
    ...over,
  } as unknown as GovTxDeps["client"];
  return { signer: { sendTransaction: send }, client, account: ME };
}

describe("revertData", () => {
  it("finds data wherever viem or a wallet nests it", () => {
    expect(revertData(viemRevert(quorumVoteClosed))).toBe(quorumVoteClosed);
    expect(revertData({ code: -32603, data: { originalError: { data: quorumVoteClosed } } })).toBe(
      quorumVoteClosed,
    );
    expect(revertData({ error: { data: { data: quorumVoteClosed } } })).toBe(quorumVoteClosed);
  });

  it("finds nothing in an error without it, and survives a cycle", () => {
    const loop: Record<string, unknown> = { message: "boom" };
    loop.cause = loop;
    expect(revertData(loop)).toBeUndefined();
    expect(revertData(new Error("x"))).toBeUndefined();
    expect(revertData({ data: "0x12" })).toBeUndefined();
  });
});

describe("governorErrorCode", () => {
  it("names the quorum-vote refusal", () => {
    expect(governorErrorCode(viemRevert(quorumVoteClosed))).toBe("quorum-vote-closed");
  });

  it.each([
    ["GovernorAlreadyCastVote", [ME], "already-voted"],
    ["GovernorInsufficientProposerVotes", [ME, 1n, 2n], "below-threshold"],
    ["GovernorNonexistentProposal", [1n], "unknown-proposal"],
  ] as const)("names %s", (errorName, args, code) => {
    const data = encodeErrorResult({ abi: governorAbi, errorName, args } as never);
    expect(governorErrorCode({ data })).toBe(code);
  });

  it("is undefined for an error it cannot decode", () => {
    expect(governorErrorCode({ data: "0xdeadbeef" })).toBeUndefined();
    expect(governorErrorCode(new Error("nope"))).toBeUndefined();
    expect(governorErrorCode(new GovernanceTxError("reverted", "x"))).toBe("reverted");
  });
});

describe("sendGovernanceTx", () => {
  const req = { to: GOVERNOR, data: "0x1234" as const };

  it("simulates, sends, reports the hash and waits for the receipt", async () => {
    const d = deps();
    const onSent = vi.fn();
    const receipt = await sendGovernanceTx(d, { ...req, onSent });
    expect(receipt.status).toBe("success");
    expect(d.client.call).toHaveBeenCalledWith(
      expect.objectContaining({ account: ME, to: GOVERNOR, data: "0x1234" }),
    );
    expect(d.signer.sendTransaction).toHaveBeenCalledWith({ to: GOVERNOR, data: "0x1234" });
    expect(onSent).toHaveBeenCalledWith(HASH);
  });

  it("passes a value through to the wallet", async () => {
    const d = deps();
    await sendGovernanceTx(d, { ...req, value: 5n });
    expect(d.signer.sendTransaction).toHaveBeenCalledWith({
      to: GOVERNOR,
      data: "0x1234",
      value: 5n,
    });
  });

  it("stops before the wallet when the simulation hits a known refusal", async () => {
    const d = deps({
      call: vi.fn(async () => Promise.reject(viemRevert(quorumVoteClosed))) as never,
    });
    const err = await sendGovernanceTx(d, req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GovernanceTxError);
    expect((err as GovernanceTxError).code).toBe("quorum-vote-closed");
    expect(d.signer.sendTransaction).not.toHaveBeenCalled();
  });

  it("rethrows an unknown revert without sending", async () => {
    const d = deps({ call: vi.fn(async () => Promise.reject(viemRevert("0xdeadbeef"))) as never });
    await expect(sendGovernanceTx(d, req)).rejects.toMatchObject({ name: "CallExecutionError" });
    expect(d.signer.sendTransaction).not.toHaveBeenCalled();
  });

  it("sends anyway when the simulation fails without revert data", async () => {
    const d = deps({ call: vi.fn(async () => Promise.reject(new Error("403"))) as never });
    await sendGovernanceTx(d, req);
    expect(d.signer.sendTransaction).toHaveBeenCalled();
  });

  it("fails a mined but reverted transaction, with its hash", async () => {
    const d = deps({
      waitForTransactionReceipt: vi.fn(async () => ({ status: "reverted" })) as never,
    });
    const err = (await sendGovernanceTx(d, req).catch((e: unknown) => e)) as GovernanceTxError;
    expect(err.code).toBe("reverted");
    expect(err.hash).toBe(HASH);
  });
});
