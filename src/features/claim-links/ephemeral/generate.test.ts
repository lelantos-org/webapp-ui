// @vitest-environment jsdom
// The vault record a claim link leaves behind names the asset that moved.
//
// It is written before the transfer, from the same arguments. With `asset`
// optional the record fell back to `0n` while the transfer fell back to the
// SDK's default, so a link generated without an explicit asset was stored
// against an id that is not the one it holds.

import { circuitAmount } from "@lelantos-org/sdk";
import { describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { generateClaimLink } from "./generate";

const vault = vi.hoisted(() => ({
  remember: vi.fn((_input: { assetId: bigint }) => "record-1"),
  markBroadcast: vi.fn(),
}));

vi.mock("../vault/store", () => ({
  rememberClaimLink: vault.remember,
  markClaimLinkBroadcast: vault.markBroadcast,
}));
vi.mock("@lelantos-org/sdk/primitives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lelantos-org/sdk/primitives")>()),
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

    await generateClaimLink(sender, { amount: circuitAmount(5n), asset: 3n, chainId: 31337n });

    expect(vault.remember).toHaveBeenCalledWith(expect.objectContaining({ assetId: 3n }));
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ asset: 3n }));
  });

  it("will not default the asset, so the record and the transfer cannot disagree", () => {
    const sender = fakeWalletApi();
    // @ts-expect-error `asset` is required.
    const call = () => generateClaimLink(sender, { amount: circuitAmount(5n), chainId: 31337n });
    expect(call).toBeTypeOf("function");
  });
});
