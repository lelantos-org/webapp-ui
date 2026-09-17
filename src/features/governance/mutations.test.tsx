// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  type TransactionReceipt,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient, withQueryClient } from "@/test/render";
import { governorAbi, govTokenAbi } from "./abi";
import {
  createdProposalId,
  NoGovernanceSigner,
  useCastVote,
  useDelegate,
  useGovernanceSigner,
  usePropose,
} from "./mutations";

const GOVERNOR = "0x5555555555555555555555555555555555555555";
const TOKEN = "0x6666666666666666666666666666666666666666";
const ME = "0x1111111111111111111111111111111111111111";
const HASH = `0x${"cd".repeat(32)}` as const;

const h = vi.hoisted(() => ({
  signer: true,
  sendTransaction: vi.fn(),
  call: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("@/features/chain", async () => {
  const { makeChain } = await import("@/test/fixtures/chains");
  const { evmAddress } = await import("@lelantos-org/sdk");
  const chain = makeChain({
    governorAddress: evmAddress("0x5555555555555555555555555555555555555555"),
    govTokenAddress: evmAddress("0x6666666666666666666666666666666666666666"),
  });
  return { useActiveChain: () => chain, useActiveChainOrUndefined: () => chain };
});
const LAYER = {
  kind: "eip1193",
  provider: {},
  address: "0x1111111111111111111111111111111111111111",
};
vi.mock("@/features/wallet", async () => {
  const { fakeWalletContext } = await import("@/test/fakes/wallet");
  return {
    useWallet: () =>
      fakeWalletContext({ ethAddress: "0x1111111111111111111111111111111111111111" }),
    useSession: () => ({ kind: "eip1193", layer: LAYER }),
  };
});
vi.mock("@/features/wallet-kinds", () => ({
  kindAdapter: () => ({
    keySource: () =>
      h.signer ? { signer: { sendTransaction: h.sendTransaction } } : { signer: undefined },
  }),
}));
vi.mock("./onchain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./onchain")>()),
  governanceClient: () => ({
    call: h.call,
    waitForTransactionReceipt: h.waitForTransactionReceipt,
  }),
}));

/// A `ProposalCreated` log as the governor emits it.
function proposalCreatedLog(id: bigint, address = GOVERNOR) {
  const event = governorAbi.find((i) => i.type === "event" && i.name === "ProposalCreated");
  if (!event || event.type !== "event") throw new Error("no ProposalCreated in the ABI");
  return {
    address,
    topics: encodeEventTopics({ abi: governorAbi, eventName: "ProposalCreated" }),
    data: encodeAbiParameters(event.inputs, [id, ME, [TOKEN], [0n], [""], ["0x"], 1n, 2n, "# t"]),
  };
}

function setup<T>(hook: () => T) {
  const client = createTestQueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const r = renderHook(hook, { wrapper: withQueryClient(client) });
  return { ...r, invalidate };
}

beforeEach(() => {
  h.signer = true;
  h.sendTransaction.mockReset().mockResolvedValue(HASH);
  h.call.mockReset().mockResolvedValue({ data: undefined });
  h.waitForTransactionReceipt
    .mockReset()
    .mockResolvedValue({ status: "success", logs: [] } as unknown as TransactionReceipt);
});

describe("useGovernanceSigner", () => {
  it("takes the signer from the kind's key source", () => {
    const { result } = renderHook(() => useGovernanceSigner());
    expect(result.current).toBeDefined();
  });
});

describe("useCastVote", () => {
  it("sends castVoteWithReason to the governor and refreshes governance reads", async () => {
    const onSent = vi.fn();
    const { result, invalidate } = setup(() => useCastVote("42"));
    act(() => result.current.mutate({ support: 2, reason: "", onSent }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [{ to, data }] = h.sendTransaction.mock.calls[0] as [{ to: string; data: `0x${string}` }];
    expect(to).toBe(GOVERNOR);
    const decoded = decodeFunctionData({ abi: governorAbi, data });
    expect(decoded.functionName).toBe("castVoteWithReason");
    expect(decoded.args).toEqual([42n, 2, ""]);
    expect(onSent).toHaveBeenCalledWith(HASH);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["governance", "31337"] });
  });

  it("fails without a signer, sending nothing", async () => {
    h.signer = false;
    const { result } = setup(() => useCastVote("42"));
    act(() => result.current.mutate({ support: 1, reason: "" }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(NoGovernanceSigner);
    expect(h.sendTransaction).not.toHaveBeenCalled();
  });
});

describe("useDelegate", () => {
  it("sends delegate to the token", async () => {
    const { result } = setup(() => useDelegate());
    act(() => result.current.mutate({ token: TOKEN as never, delegatee: ME as never }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [{ to, data }] = h.sendTransaction.mock.calls[0] as [{ to: string; data: `0x${string}` }];
    expect(to).toBe(TOKEN);
    expect(decodeFunctionData({ abi: govTokenAbi, data })).toMatchObject({
      functionName: "delegate",
      args: [ME],
    });
  });
});

describe("usePropose", () => {
  it("proposes and resolves with the id from the receipt", async () => {
    h.waitForTransactionReceipt.mockResolvedValue({
      status: "success",
      logs: [proposalCreatedLog(99n)],
    });
    const { result } = setup(() => usePropose());
    act(() =>
      result.current.mutate({
        actions: [{ target: TOKEN as never, value: 0n, calldata: "0x" }],
        description: "# t",
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.proposalId).toBe("99");
    const [{ data }] = h.sendTransaction.mock.calls[0] as [{ data: `0x${string}` }];
    expect(decodeFunctionData({ abi: governorAbi, data }).args).toEqual([
      [TOKEN],
      [0n],
      ["0x"],
      "# t",
    ]);
  });
});

describe("createdProposalId", () => {
  it("reads only the governor's own ProposalCreated", () => {
    expect(createdProposalId({ logs: [proposalCreatedLog(5n)] as never }, GOVERNOR as never)).toBe(
      "5",
    );
    expect(
      createdProposalId({ logs: [proposalCreatedLog(5n, TOKEN)] as never }, GOVERNOR as never),
    ).toBeUndefined();
    expect(
      createdProposalId(
        { logs: [{ address: GOVERNOR, topics: [`0x${"00".repeat(32)}`], data: "0x" }] as never },
        GOVERNOR as never,
      ),
    ).toBeUndefined();
  });
});
