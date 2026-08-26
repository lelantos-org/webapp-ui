// `switchChain`'s add-then-retry fallback, which had no coverage at all — and
// which never ran in practice, because the `4902` it keys off arrives wrapped
// in a generic `-32603` from every wallet built on `rpc-errors`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@/config/chains";
import { announce } from "@/test/eip6963";
import { walletStore } from "./store";

const CHAIN = {
  chainId: 31337n,
  chainName: "Anvil",
  rpcUrl: "http://localhost:8545",
  explorerUrl: "https://explorer.example",
} as ChainEntry;

/// The wrapper MetaMask and Rabby put a 4902 inside.
const unrecognized = {
  code: -32603,
  message: 'Unrecognized chain ID "0x7a69".',
  data: { originalError: { code: 4902 } },
};

interface Call {
  method: string;
  params?: unknown[];
}

/// A provider that records what it was asked and answers per method.
function fakeProvider(answers: Record<string, () => unknown>) {
  const calls: Call[] = [];
  const request = vi.fn(async ({ method, params }: Call) => {
    calls.push({ method, params });
    const answer = answers[method];
    if (!answer) throw new Error(`unstubbed method: ${method}`);
    return answer();
  });
  return { calls, provider: { request } };
}

/// Drive a real `connect()` so the store latches the provider; `attach` is
/// private and reaching past it would test a different object.
async function connectWith(provider: { request: ReturnType<typeof vi.fn> }) {
  announce({
    info: { uuid: "uuid-rb", name: "Rabby", icon: "", rdns: "io.rabby" },
    provider,
  });
  await walletStore.connect("io.rabby");
}

describe("switchChain", () => {
  beforeEach(() => {
    walletStore.resetForTest();
    walletStore.startDiscovery();
    localStorage.clear();
  });

  it("switches directly when the wallet already knows the chain", async () => {
    const { calls, provider } = fakeProvider({
      eth_requestAccounts: () => ["0xAbC0000000000000000000000000000000000001"],
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => null,
    });
    await connectWith(provider);

    await walletStore.switchChain(CHAIN);

    expect(calls.filter((c) => c.method === "wallet_addEthereumChain")).toHaveLength(0);
    expect(calls.at(-1)).toEqual({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x7a69" }],
    });
  });

  it("adds the chain, then switches again, when the wallet does not know it", async () => {
    let switched = 0;
    const { calls, provider } = fakeProvider({
      eth_requestAccounts: () => ["0xAbC0000000000000000000000000000000000001"],
      eth_chainId: () => "0x1",
      // Refuse the first switch the way a wallet that lacks the chain does.
      wallet_switchEthereumChain: () => {
        switched += 1;
        if (switched === 1) throw unrecognized;
        return null;
      },
      wallet_addEthereumChain: () => null,
    });
    await connectWith(provider);

    await walletStore.switchChain(CHAIN);

    expect(calls.map((c) => c.method).slice(-3)).toEqual([
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
    ]);
    // The params the wallet is asked to register. `nativeCurrency` is the same
    // for every chain the app serves; `blockExplorerUrls` is omitted entirely
    // when unset, because some wallets reject an explicit `undefined`.
    expect(calls.find((c) => c.method === "wallet_addEthereumChain")?.params).toEqual([
      {
        chainId: "0x7a69",
        chainName: "Anvil",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["http://localhost:8545"],
        blockExplorerUrls: ["https://explorer.example"],
      },
    ]);
  });

  it("omits blockExplorerUrls entirely for a chain with no explorer", async () => {
    const { calls, provider } = fakeProvider({
      eth_requestAccounts: () => ["0xAbC0000000000000000000000000000000000001"],
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: (() => {
        let n = 0;
        return () => {
          n += 1;
          if (n === 1) throw unrecognized;
          return null;
        };
      })(),
      wallet_addEthereumChain: () => null,
    });
    await connectWith(provider);

    await walletStore.switchChain({ ...CHAIN, explorerUrl: undefined } as ChainEntry);

    const params = calls.find((c) => c.method === "wallet_addEthereumChain")?.params?.[0];
    expect(Object.hasOwn(params as object, "blockExplorerUrls")).toBe(false);
  });

  it("propagates the add failure rather than the switch that provoked it", async () => {
    // The three realistic causes — the wallet refusing custom networks, an RPC
    // URL the browser cannot reach, an RPC reporting a different chain id — are
    // only distinguishable from the add's own error.
    const addFailed = { code: 4001, message: "User rejected the request." };
    const { provider } = fakeProvider({
      eth_requestAccounts: () => ["0xAbC0000000000000000000000000000000000001"],
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        throw unrecognized;
      },
      wallet_addEthereumChain: () => {
        throw addFailed;
      },
    });
    await connectWith(provider);

    await expect(walletStore.switchChain(CHAIN)).rejects.toBe(addFailed);
  });

  it("rethrows any other refusal untouched", async () => {
    const rejected = { code: 4001, message: "User rejected the request." };
    const { calls, provider } = fakeProvider({
      eth_requestAccounts: () => ["0xAbC0000000000000000000000000000000000001"],
      eth_chainId: () => "0x1",
      wallet_switchEthereumChain: () => {
        throw rejected;
      },
    });
    await connectWith(provider);

    await expect(walletStore.switchChain(CHAIN)).rejects.toBe(rejected);
    expect(calls.filter((c) => c.method === "wallet_addEthereumChain")).toHaveLength(0);
  });

  it("refuses to switch with no wallet connected", async () => {
    await expect(walletStore.switchChain(CHAIN)).rejects.toThrow("Wallet not connected.");
  });
});
