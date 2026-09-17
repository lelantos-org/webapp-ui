import { beforeEach, describe, expect, it, vi } from "vitest";
import { announce } from "@/test/fakes/eip6963";
import { makeChain } from "@/test/fixtures/chains";
import { eip1193Store } from "./store";

const CHAIN = makeChain({ chainName: "Anvil", explorerUrl: "https://explorer.example" });

const unrecognized = {
  code: -32603,
  message: 'Unrecognized chain ID "0x7a69".',
  data: { originalError: { code: 4902 } },
};

interface Call {
  method: string;
  params?: unknown[] | undefined;
}

const CONNECTS = {
  eth_requestAccounts: () => ["0xAbC0000000000000000000000000000000000001"],
  eth_chainId: () => "0x1",
};

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

function unknownChainProvider(add: () => unknown = () => null) {
  let switched = 0;
  return fakeProvider({
    ...CONNECTS,
    wallet_switchEthereumChain: () => {
      switched += 1;
      if (switched === 1) throw unrecognized;
      return null;
    },
    wallet_addEthereumChain: add,
  });
}

const RABBY = { uuid: "uuid-rb", name: "Rabby", icon: "", rdns: "io.rabby" };
const PHANTOM = { uuid: "uuid-ph", name: "Phantom", icon: "", rdns: "app.phantom" };
const PHANTOM_REFUSAL = "Phantom does not support Anvil. Pick another network or wallet.";

async function connectWith(provider: { request: ReturnType<typeof vi.fn> }, info = RABBY) {
  announce({ info, provider });
  await eip1193Store.connect(info.rdns);
}

describe("switchChain", () => {
  beforeEach(() => {
    eip1193Store.resetForTest();
    eip1193Store.startDiscovery();
    localStorage.clear();
  });

  it("switches directly when the wallet already knows the chain", async () => {
    const { calls, provider } = fakeProvider({
      ...CONNECTS,
      wallet_switchEthereumChain: () => null,
    });
    await connectWith(provider);

    await eip1193Store.switchChain(CHAIN);

    expect(calls.filter((c) => c.method === "wallet_addEthereumChain")).toHaveLength(0);
    expect(calls.at(-1)).toEqual({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x7a69" }],
    });
  });

  it("adds the chain, then switches again, when the wallet does not know it", async () => {
    const { calls, provider } = unknownChainProvider();
    await connectWith(provider);

    await eip1193Store.switchChain(CHAIN);

    expect(calls.map((c) => c.method).slice(-3)).toEqual([
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_switchEthereumChain",
    ]);
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
    const { calls, provider } = unknownChainProvider();
    await connectWith(provider);

    await eip1193Store.switchChain({ ...CHAIN, explorerUrl: undefined });

    const params = calls.find((c) => c.method === "wallet_addEthereumChain")?.params?.[0];
    expect(Object.hasOwn(params as object, "blockExplorerUrls")).toBe(false);
  });

  it("propagates the add failure rather than the switch that provoked it", async () => {
    const addFailed = { code: 4001, message: "User rejected the request." };
    const { provider } = fakeProvider({
      ...CONNECTS,
      wallet_switchEthereumChain: () => {
        throw unrecognized;
      },
      wallet_addEthereumChain: () => {
        throw addFailed;
      },
    });
    await connectWith(provider);

    await expect(eip1193Store.switchChain(CHAIN)).rejects.toBe(addFailed);
  });

  it("rethrows any other refusal untouched", async () => {
    const rejected = { code: 4001, message: "User rejected the request." };
    const { calls, provider } = fakeProvider({
      ...CONNECTS,
      wallet_switchEthereumChain: () => {
        throw rejected;
      },
    });
    await connectWith(provider);

    await expect(eip1193Store.switchChain(CHAIN)).rejects.toBe(rejected);
    expect(calls.filter((c) => c.method === "wallet_addEthereumChain")).toHaveLength(0);
  });

  it("names the wallet and chain when the wallet refuses to add a chain it cannot use", async () => {
    const refused = { code: 4200, message: "Unsupported method: wallet_addEthereumChain" };
    const { calls, provider } = fakeProvider({
      ...CONNECTS,
      wallet_switchEthereumChain: () => {
        throw unrecognized;
      },
      wallet_addEthereumChain: () => {
        throw refused;
      },
    });
    await connectWith(provider, PHANTOM);

    await expect(eip1193Store.switchChain(CHAIN)).rejects.toMatchObject({
      message: PHANTOM_REFUSAL,
      cause: refused,
    });
    expect(calls.filter((c) => c.method === "wallet_addEthereumChain")).toHaveLength(1);
  });

  it("names the wallet when the switch itself is refused as unsupported", async () => {
    const { calls, provider } = fakeProvider({
      ...CONNECTS,
      wallet_switchEthereumChain: () => {
        throw { code: -32603, message: "Unsupported chainId: 0x7a69" };
      },
    });
    await connectWith(provider, PHANTOM);

    await expect(eip1193Store.switchChain(CHAIN)).rejects.toThrow(PHANTOM_REFUSAL);
    expect(calls.filter((c) => c.method === "wallet_addEthereumChain")).toHaveLength(0);
  });

  it("refuses to switch with no wallet connected", async () => {
    await expect(eip1193Store.switchChain(CHAIN)).rejects.toThrow("Wallet not connected.");
  });
});
