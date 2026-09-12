// @vitest-environment jsdom
// The vault record a claim link leaves behind names the asset that moved.
//
// It is written before the transfer, from the same arguments. With `asset`
// optional the record fell back to `0n` while the transfer fell back to the
// SDK's default, so a link generated without an explicit asset was stored
// against an id that is not the one it holds.

import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { generateClaimLink, summarizeEphemeralNotes } from "./ephemeral-wallet";

const vault = vi.hoisted(() => ({
  remember: vi.fn((_input: { assetId: bigint }) => "record-1"),
  markBroadcast: vi.fn(),
}));

vi.mock("./link-vault/store", () => ({
  rememberClaimLink: vault.remember,
  markClaimLinkBroadcast: vault.markBroadcast,
}));
vi.mock("@lelantos-org/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lelantos-org/sdk")>()),
  deriveKeysFromNsk: async () => ({ address: "lelantos1ephemeral" }),
}));
vi.mock("@/features/wallet", () => ({}));
vi.mock("@/features/wallet-kinds", () => ({
  nskHexFromField: () => "ab".repeat(32),
  nskFieldFromHex: () => ({ ok: true, value: 1n }),
}));

describe("generateClaimLink", () => {
  it("records the asset it transfers", async () => {
    const transfer = vi.fn(async () => ({ txHash: "0xtx" }));
    const sender = fakeWalletApi({ transfer });

    await generateClaimLink(sender, { amount: 5n, asset: 3n, chainId: 31337n });

    expect(vault.remember).toHaveBeenCalledWith(expect.objectContaining({ assetId: 3n }));
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ asset: 3n }));
  });

  it("will not default the asset, so the record and the transfer cannot disagree", () => {
    const sender = fakeWalletApi();
    // @ts-expect-error `asset` is required.
    const call = () => generateClaimLink(sender, { amount: 5n, chainId: 31337n });
    expect(call).toBeTypeOf("function");
  });
});

describe("summarizeEphemeralNotes", () => {
  it("totals the unspent notes per asset, in asset order", () => {
    const notes = vi.fn(() => [
      { asset: 3n, value: 5n },
      { asset: 1n, value: 2n },
      { asset: 3n, value: 7n },
    ]);
    const eph = fakeWalletApi({ notes });

    expect(summarizeEphemeralNotes(eph)).toEqual([
      { asset: 1n, amount: 2n, notes: 1 },
      { asset: 3n, amount: 12n, notes: 2 },
    ]);
    // A spent note is already gone from the link; counting it would offer to
    // sweep funds that are not there.
    expect(notes).toHaveBeenCalledWith({ spent: false });
  });

  it("is empty for a link that holds nothing", () => {
    expect(summarizeEphemeralNotes(fakeWalletApi({ notes: () => [] }))).toEqual([]);
  });
});
