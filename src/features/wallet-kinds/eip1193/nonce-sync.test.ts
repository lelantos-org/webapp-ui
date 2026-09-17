import { type EthSigner, evmAddress, type Hex32 } from "@lelantos-org/sdk";
import { describe, expect, it, type Mock, vi } from "vitest";
import { isStaleNonce, withNonceSync } from "./nonce-sync";

const TO = evmAddress("0x0000000000000000000000000000000000000001");

/// A wallet trailing the app: its node has the receipts, but `head` lags and advances one block per read.
function laggingWallet(opts: { head: number; minedAt: Record<string, number> }) {
  let head = opts.head;
  let reported: number | undefined;
  const calls: string[] = [];
  const provider = {
    request: vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
      calls.push(method);
      if (method === "eth_blockNumber") {
        reported = head++;
        return `0x${reported.toString(16)}`;
      }
      if (method === "eth_getTransactionReceipt") {
        const at = opts.minedAt[params?.[0] as string];
        return at === undefined ? null : { blockNumber: `0x${at.toString(16)}` };
      }
      throw new Error(`unexpected ${method}`);
    }),
  };
  return { provider, calls, reported: () => reported };
}

function signerSending(...outcomes: unknown[]): EthSigner & {
  sendTransaction: Mock<EthSigner["sendTransaction"]>;
} {
  const queue = [...outcomes];
  return {
    chainId: 31337n,
    getAddress: async () => TO,
    signTypedData: vi.fn(async () => "0xsig"),
    sendTransaction: vi.fn<EthSigner["sendTransaction"]>(async () => {
      const next = queue.shift();
      if (typeof next !== "string") throw next;
      return next as Hex32;
    }),
  };
}

const fast = { pollMs: 0, timeoutMs: 1_000 };

describe("withNonceSync", () => {
  it("sends the first transaction without waiting on anything", async () => {
    const wallet = laggingWallet({ head: 1, minedAt: {} });
    const inner = signerSending("0xa");
    const signer = withNonceSync(inner, wallet.provider, fast);

    await expect(signer.sendTransaction({ to: TO })).resolves.toBe("0xa");
    expect(wallet.calls).toEqual([]);
  });

  it("holds the next send until the wallet has seen the previous one mined", async () => {
    const wallet = laggingWallet({ head: 140, minedAt: { "0xapprove": 149 } });
    const inner = signerSending("0xapprove", "0xpermit");
    const signer = withNonceSync(inner, wallet.provider, fast);

    await signer.sendTransaction({ to: TO });
    let seenAtSecondSend: number | undefined;
    inner.sendTransaction.mockImplementationOnce(async () => {
      seenAtSecondSend = wallet.reported();
      return "0xpermit" as Hex32;
    });
    await expect(signer.sendTransaction({ to: TO })).resolves.toBe("0xpermit");

    expect(seenAtSecondSend).toBeGreaterThanOrEqual(149);
  });

  it("sends anyway once the wait times out", async () => {
    const wallet = laggingWallet({ head: 1, minedAt: {} });
    const inner = signerSending("0xlost", "0xnext");
    const signer = withNonceSync(inner, wallet.provider, { pollMs: 1, timeoutMs: 5 });

    await signer.sendTransaction({ to: TO });
    await expect(signer.sendTransaction({ to: TO })).resolves.toBe("0xnext");
  });

  it("does not charge a never-mined transaction's timeout to every later send", async () => {
    const wallet = laggingWallet({ head: 1, minedAt: { "0xnext": 1 } });
    const inner = signerSending("0xlost", "0xnext", "0xthird");
    const signer = withNonceSync(inner, wallet.provider, { pollMs: 1, timeoutMs: 5 });

    await signer.sendTransaction({ to: TO });
    await signer.sendTransaction({ to: TO });
    wallet.provider.request.mockClear();
    await signer.sendTransaction({ to: TO });

    const receipts = wallet.provider.request.mock.calls.filter(
      ([a]) => a.method === "eth_getTransactionReceipt",
    );
    expect(receipts.map(([a]) => a.params)).toEqual([["0xnext"]]);
  });

  it("retries a stale-nonce refusal once the wallet's view advances", async () => {
    const wallet = laggingWallet({ head: 10, minedAt: {} });
    const refusal = {
      code: -32603,
      message: "Internal JSON-RPC error.",
      data: { originalError: { message: "Transaction rejected: nonce too low" } },
    };
    const inner = signerSending(refusal, "0xretried");
    const signer = withNonceSync(inner, wallet.provider, fast);

    await expect(signer.sendTransaction({ to: TO })).resolves.toBe("0xretried");
    expect(inner.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it("retries only once", async () => {
    const wallet = laggingWallet({ head: 10, minedAt: {} });
    const refusal = new Error("nonce too low");
    const inner = signerSending(refusal, refusal);
    const signer = withNonceSync(inner, wallet.provider, fast);

    await expect(signer.sendTransaction({ to: TO })).rejects.toBe(refusal);
    expect(inner.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it("never retries anything else, a cancellation least of all", async () => {
    const wallet = laggingWallet({ head: 10, minedAt: {} });
    const rejected = { code: 4001, message: "User rejected the request." };
    const inner = signerSending(rejected);
    const signer = withNonceSync(inner, wallet.provider, fast);

    await expect(signer.sendTransaction({ to: TO })).rejects.toBe(rejected);
    expect(inner.sendTransaction).toHaveBeenCalledTimes(1);
    expect(wallet.calls).toEqual([]);
  });

  it("passes signing and identity through untouched", async () => {
    const wallet = laggingWallet({ head: 1, minedAt: {} });
    const inner = signerSending();
    const signer = withNonceSync(inner, wallet.provider, fast);

    expect(signer.chainId).toBe(31337n);
    await expect(signer.getAddress()).resolves.toBe(TO);
    await expect(signer.signTypedData({}, {}, "X", {})).resolves.toBe("0xsig");
    expect(wallet.calls).toEqual([]);
  });
});

describe("isStaleNonce", () => {
  it("recognises each wording, at any depth", () => {
    expect(isStaleNonce(new Error("nonce too low"))).toBe(true);
    expect(isStaleNonce({ message: "replacement transaction underpriced" })).toBe(true);
    expect(isStaleNonce({ code: -32603, data: { message: "nonce has already been used" } })).toBe(
      true,
    );
  });

  it("leaves other failures alone", () => {
    expect(isStaleNonce(new Error("execution reverted"))).toBe(false);
    expect(isStaleNonce({ code: 4001, message: "User rejected the request." })).toBe(false);
    expect(isStaleNonce(null)).toBe(false);
  });
});
