import { beforeEach, describe, expect, it, vi } from "vitest";
import { storageDigest } from "@/shared/lib/storage/digest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { makeChain } from "@/test/fixtures/chains";
import { lastArg } from "@/test/spies";
import {
  buildEphemeralWallet,
  clearEphemeralStore,
  summarizeEphemeralNotes,
} from "./ephemeral-wallet";

const h = vi.hoisted(() => ({
  destroy: vi.fn(),
  connect: vi.fn(),
  clearSubscription: vi.fn(),
}));

vi.mock("@/features/wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/wallet")>()),
  linkNoteStoreKey: (_chainId: bigint, digest: string) => `in-use:${digest}`,
  linkNoteStoreKeys: (_chainId: bigint, digest: string) => [
    `built-in:${digest}`,
    `in-use:${digest}`,
  ],
  connectWallet: h.connect,
  clearCachedSubscription: h.clearSubscription,
  IdbNoteStore: class {
    constructor(readonly key: string) {}
    async destroy() {
      h.destroy(this.key);
    }
  },
}));
vi.mock("@lelantos-org/sdk/primitives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lelantos-org/sdk/primitives")>()),
  deriveKeysFromNsk: async () => ({ address: "lelantos1eph" }),
}));

const NSK_HEX = `${"00".repeat(31)}07`;
// A digest of the bearer key, never the key itself.
const DIGEST = storageDigest(NSK_HEX);

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockResolvedValue({ wallet: fakeWalletApi() });
});

describe("the link's note store", () => {
  it("is opened under the note feed in use", async () => {
    await buildEphemeralWallet(NSK_HEX, undefined, makeChain({ chainId: 31337n }));
    expect(lastArg(h.connect).storage.notes.key).toBe(`in-use:${DIGEST}`);
  });

  it("is dropped wherever it can be, with its subscription, once the link is done", async () => {
    await clearEphemeralStore(31337n, NSK_HEX);
    expect(h.destroy.mock.calls).toEqual([[`built-in:${DIGEST}`], [`in-use:${DIGEST}`]]);
    expect(h.clearSubscription).toHaveBeenCalledWith(31337n, "lelantos1eph");
  });
});

describe("summarizeEphemeralNotes", () => {
  it("totals the unspent notes per asset, in asset order", async () => {
    const notes = vi.fn(async () => [
      { asset: 3n, value: 5n },
      { asset: 1n, value: 2n },
      { asset: 3n, value: 7n },
    ]);
    const eph = fakeWalletApi({ notes });

    await expect(summarizeEphemeralNotes(eph)).resolves.toEqual([
      { asset: 1n, amount: 2n, notes: 1 },
      { asset: 3n, amount: 12n, notes: 2 },
    ]);
    expect(notes).toHaveBeenCalledWith({ spent: false });
  });

  it("is empty for a link that holds nothing", async () => {
    await expect(
      summarizeEphemeralNotes(fakeWalletApi({ notes: async () => [] })),
    ).resolves.toEqual([]);
  });
});
