import { circuitAmount } from "@lelantos-org/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { generateClaimLink } from "./generate";

const vault = vi.hoisted(() => ({
  remember: vi.fn((_input: { assetId: bigint; url: string }) => "record-1"),
  markBroadcast: vi.fn(),
}));

vi.mock("../vault/store", () => ({
  rememberClaimLink: vault.remember,
  markClaimLinkBroadcast: vault.markBroadcast,
  claimLinksSnapshot: () => [],
}));
vi.mock("@/features/wallet", () => ({ releaseScanner: () => {} }));
vi.mock("@/features/wallet-kinds", () => ({
  nskHexFromField: (nsk: bigint) => nsk.toString(16).padStart(64, "0"),
  nskFieldFromHex: () => ({ ok: true, value: 1n }),
}));

/// A sender whose `index`-th link key is `index + 1`, at an address naming the index.
function sender(transfer = vi.fn(async () => ({ txHash: "0xtx" }))) {
  const claimLinkKey = vi.fn(async (index: number) => ({
    index,
    nsk: BigInt(index + 1),
    address: `lelantos1link${index}`,
  }));
  return {
    wallet: fakeWalletApi({ address: "lelantos1sender", transfer, claimLinkKey }),
    transfer,
  };
}

const neverUsed = async () => undefined;

beforeEach(() => {
  localStorage.clear();
  vault.remember.mockClear();
});

describe("generateClaimLink", () => {
  it("records the asset it transfers", async () => {
    const { wallet, transfer } = sender();

    await generateClaimLink(wallet, {
      amount: circuitAmount(5n),
      asset: 3n,
      chainId: 31337n,
      probe: neverUsed,
    });

    expect(vault.remember).toHaveBeenCalledWith(expect.objectContaining({ assetId: 3n }));
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ asset: 3n }));
  });

  it("will not default the asset, so the record and the transfer cannot disagree", () => {
    const { wallet } = sender();
    const call = () =>
      // @ts-expect-error `asset` is required.
      generateClaimLink(wallet, { amount: circuitAmount(5n), chainId: 31337n, probe: neverUsed });
    expect(call).toBeTypeOf("function");
  });

  // The key is recomputable from the sender's seed, so an unclaimed link is recoverable.
  it("funds the seed-derived account for its index, and puts that key in the link", async () => {
    const { wallet, transfer } = sender();

    const made = await generateClaimLink(wallet, {
      amount: circuitAmount(5n),
      asset: 3n,
      chainId: 31337n,
      probe: neverUsed,
    });

    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ recipient: "lelantos1link0" }));
    expect(made.ephAddress).toBe("lelantos1link0");
    expect(made.url).toMatch(/\/claim#7a69:0{63}1$/);
  });

  // Two links from one index share a key: the holder of the first could take the second.
  it("skips an index whose account has ever held a note", async () => {
    const { wallet, transfer } = sender();
    const keyOf = (n: number) => n.toString(16).padStart(64, "0");
    const used = new Set([keyOf(1), keyOf(2)]);
    const probe = vi.fn(async (nskHex: string) => (used.has(nskHex) ? [] : undefined));

    await generateClaimLink(wallet, {
      amount: circuitAmount(5n),
      asset: 3n,
      chainId: 31337n,
      probe,
    });

    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ recipient: "lelantos1link2" }));
  });

  it("starts the next link past the one it funded, and still checks that index", async () => {
    const { wallet, transfer } = sender();
    const probe = vi.fn(neverUsed);
    const args = { amount: circuitAmount(5n), asset: 3n, chainId: 31337n, probe };

    await generateClaimLink(wallet, args);
    await generateClaimLink(wallet, args);

    expect(transfer).toHaveBeenLastCalledWith(
      expect.objectContaining({ recipient: "lelantos1link1" }),
    );
    // One probe per link: the stored mark is a hint, never trusted on its own.
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("takes the same index again after a transfer that never landed", async () => {
    const failing = vi.fn(async () => {
      throw new Error("relayer down");
    });
    const first = sender(failing as never);
    const args = { amount: circuitAmount(5n), asset: 3n, chainId: 31337n, probe: neverUsed };
    await expect(generateClaimLink(first.wallet, args)).rejects.toThrow("relayer down");

    const second = sender();
    await generateClaimLink(second.wallet, args);
    expect(second.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "lelantos1link0" }),
    );
  });
});
