import { evmAddress } from "@lelantos-org/sdk";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hexAddress, SHIELDED_ADDRESS } from "@/test/fixtures/addresses";
import { makeChain } from "@/test/fixtures/chains";
import { renderQueryHook } from "@/test/render";
import { useInvalidateNames, useNameAvailable, useNameFee, useNameRecord } from "./queries";

const REGISTRAR = evmAddress(hexAddress("77"));
const CONTROLLER = hexAddress("c0");
const FEE_TOKEN = hexAddress("fe");
const CHAIN = makeChain({ nameRegistrarAddress: REGISTRAR });

type Call = { functionName: string; args?: readonly unknown[]; address: string };
type Answers = Record<string, (args: readonly unknown[]) => unknown>;

/// A registrar where only `mehow` is claimed.
const REGISTRAR_READS: Answers = {
  recordOf: ([label]) =>
    label === "mehow" ? [SHIELDED_ADDRESS, CONTROLLER, 2n] : ["", hexAddress("00"), 0n],
  available: ([label]) => label !== "mehow",
  feeToken: () => FEE_TOKEN,
  feeAmount: () => 5_000_000n,
};
const readContract = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ namesClient: () => ({ readContract }) }));

/// Has the registrar answer every read, with `over` in place of its usual answers.
function answer(over: Answers = {}) {
  const reads = { ...REGISTRAR_READS, ...over };
  readContract.mockImplementation(async (c: Call) => {
    const read = reads[c.functionName];
    if (!read) throw new Error(`unexpected read ${c.functionName}`);
    return read(c.args ?? []);
  });
}

beforeEach(() => answer());

describe("useNameRecord", () => {
  it("reads a registered handle's value and controller from the registrar", async () => {
    const { result } = renderQueryHook(() => useNameRecord(CHAIN, "mehow"));
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      registered: true,
      value: SHIELDED_ADDRESS,
      controller: CONTROLLER,
      nonce: 2n,
    });
    expect(readContract.mock.lastCall?.[0]).toMatchObject({
      address: REGISTRAR,
      functionName: "recordOf",
      args: ["mehow"],
    });
  });

  it("reads an unclaimed label as unregistered", async () => {
    const { result } = renderQueryHook(() => useNameRecord(CHAIN, "nobody"));
    await waitFor(() => expect(result.current.data?.registered).toBe(false));
  });

  it("surfaces a failed read", async () => {
    readContract.mockRejectedValue(new Error("rpc down"));
    const { result } = renderQueryHook(() => useNameRecord(CHAIN, "mehow"));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("reads nothing without a registrar, a chain or a label", () => {
    renderQueryHook(() => useNameRecord(makeChain(), "mehow"));
    renderQueryHook(() => useNameRecord(undefined, "mehow"));
    renderQueryHook(() => useNameRecord(CHAIN, undefined));
    expect(readContract).not.toHaveBeenCalled();
  });
});

describe("useNameAvailable", () => {
  it("says whether a label can still be claimed", async () => {
    const taken = renderQueryHook(() => useNameAvailable(CHAIN, "mehow"));
    const free = renderQueryHook(() => useNameAvailable(CHAIN, "fresh"));
    await waitFor(() => expect(taken.result.current.data).toBe(false));
    await waitFor(() => expect(free.result.current.data).toBe(true));
  });

  it("reads nothing without a registrar or a label", () => {
    renderQueryHook(() => useNameAvailable(makeChain(), "mehow"));
    renderQueryHook(() => useNameAvailable(CHAIN, undefined));
    expect(readContract).not.toHaveBeenCalled();
  });
});

describe("useNameFee", () => {
  it("reads the registrar's fee token and amount", async () => {
    const { result } = renderQueryHook(() => useNameFee(CHAIN));
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ token: FEE_TOKEN, amount: 5_000_000n });
  });

  it("reads nothing without a registrar", () => {
    renderQueryHook(() => useNameFee(makeChain()));
    expect(readContract).not.toHaveBeenCalled();
  });
});

describe("useInvalidateNames", () => {
  it("refetches the registrar's reads", async () => {
    const { result } = renderQueryHook(() => ({
      available: useNameAvailable(CHAIN, "fresh"),
      invalidate: useInvalidateNames(CHAIN),
    }));
    await waitFor(() => expect(result.current.available.data).toBe(true));

    answer({ available: () => false });
    await result.current.invalidate();
    await waitFor(() => expect(result.current.available.data).toBe(false));
  });
});
