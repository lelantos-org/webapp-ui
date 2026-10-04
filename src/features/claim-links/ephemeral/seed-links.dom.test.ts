import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { recoverClaimLinks } from "./seed-links";

const vault = vi.hoisted(() => ({
  records: [] as { url: string; assetId: string }[],
  remember: vi.fn(),
}));

vi.mock("../vault/store", () => ({
  rememberClaimLink: (input: { url: string; assetId: bigint }) => {
    vault.remember(input);
    vault.records.push({ url: input.url, assetId: input.assetId.toString() });
    return "record";
  },
  claimLinksSnapshot: () => vault.records,
}));
vi.mock("@/features/wallet", () => ({ releaseScanner: () => {} }));
vi.mock("@/features/wallet-kinds", () => ({
  nskHexFromField: (nsk: bigint) => nsk.toString(16).padStart(64, "0"),
  nskFieldFromHex: () => ({ ok: true, value: 1n }),
}));

const ORIGIN = "https://app.test";
const CHAIN = 31337n;
const keyOf = (index: number) => (index + 1).toString(16).padStart(64, "0");
const urlOf = (index: number) => `${ORIGIN}/claim#7a69:${keyOf(index)}`;

const sender = fakeWalletApi({
  address: "lelantos1sender",
  claimLinkKey: async (index: number) => ({
    index,
    nsk: BigInt(index + 1),
    address: `lelantos1link${index}`,
  }),
});

/// A pool where link `i` holds `holdings[i]`; indices past the list were never funded.
function poolOf(holdings: { asset: bigint; amount: bigint; notes: number }[][]) {
  return vi.fn(async (nskHex: string) => holdings[Number(BigInt(`0x${nskHex}`)) - 1]);
}

beforeEach(() => {
  localStorage.clear();
  vault.records.length = 0;
  vault.remember.mockClear();
});

// Unless the sender's seed can find it, an unopened link is lost with the browser that made it.
describe("recoverClaimLinks", () => {
  it("restores every link that still holds funds, and skips the claimed ones", async () => {
    const probe = poolOf([
      [{ asset: 3n, amount: 5n, notes: 1 }],
      [],
      [{ asset: 4n, amount: 9n, notes: 2 }],
    ]);

    const out = await recoverClaimLinks(sender, CHAIN, probe, ORIGIN);

    expect(out).toEqual({ funded: 3, unclaimed: 2, restored: 2 });
    expect(vault.remember.mock.calls.map(([r]) => r)).toEqual([
      { url: urlOf(0), chainId: CHAIN, assetId: 3n, amount: 5n, derived: true },
      { url: urlOf(2), chainId: CHAIN, assetId: 4n, amount: 9n, derived: true },
    ]);
  });

  it("stops at the first account that never held a note", async () => {
    const probe = poolOf([[{ asset: 3n, amount: 5n, notes: 1 }]]);

    await recoverClaimLinks(sender, CHAIN, probe, ORIGIN);

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate a link the vault already holds", async () => {
    vault.records.push({ url: urlOf(0), assetId: "3" });
    const probe = poolOf([[{ asset: 3n, amount: 5n, notes: 1 }]]);

    const out = await recoverClaimLinks(sender, CHAIN, probe, ORIGIN);

    expect(out).toEqual({ funded: 1, unclaimed: 1, restored: 0 });
    expect(vault.remember).not.toHaveBeenCalled();
  });

  it("adds one record per asset a link holds", async () => {
    const probe = poolOf([
      [
        { asset: 3n, amount: 5n, notes: 1 },
        { asset: 4n, amount: 1n, notes: 1 },
      ],
    ]);

    const out = await recoverClaimLinks(sender, CHAIN, probe, ORIGIN);

    expect(out.restored).toBe(2);
  });

  it("finds nothing for a seed that never made a link", async () => {
    await expect(recoverClaimLinks(sender, CHAIN, poolOf([]), ORIGIN)).resolves.toEqual({
      funded: 0,
      unclaimed: 0,
      restored: 0,
    });
  });
});
