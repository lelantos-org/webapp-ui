import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { describe, expect, it, vi } from "vitest";
import type { ChainEntry } from "@/config/chains";
import { createSdkActions } from "./sdk-adapter";

// The adapter brands L1 recipients via `evmAddress`, which requires a
// 20-byte 0x-prefixed address.
const RECIPIENT = "0x000000000000000000000000000000000000dead";

/// Only the fields the adapter reads. `swapWrapperAddress` is absent, matching
/// a chain with no wrapper deployed.
const CHAIN = { chainId: 31337n, chainName: "local" } as ChainEntry;

function fakeWallet() {
  const deposit = vi.fn().mockResolvedValue({ txHash: "0xdep" });
  const transfer = vi.fn().mockResolvedValue({ txHash: "0xtx" });
  const withdraw = vi.fn().mockResolvedValue({ txHash: "0xwd" });
  const withdrawEth = vi.fn().mockResolvedValue({ txHash: "0xwdeth" });
  return { deposit, transfer, withdraw, withdrawEth } as unknown as WalletApi;
}

describe("createSdkActions", () => {
  it("deposit forwards amount + optional asset to wallet.deposit", async () => {
    const w = fakeWallet();
    const a = createSdkActions(w, CHAIN);
    const r = await a.deposit({ amount: 100n });
    expect(r.txHash).toBe("0xdep");
    expect(w.deposit).toHaveBeenCalledWith({ amount: 100n, asset: undefined });

    await a.deposit({ amount: 100n, asset: 2n });
    expect(w.deposit).toHaveBeenLastCalledWith({ amount: 100n, asset: 2n });
  });

  it("transfer forwards to + amount + optional asset with autoConsolidate", async () => {
    const w = fakeWallet();
    const a = createSdkActions(w, CHAIN);
    await a.transfer({ to: "lel1abc", amount: 50n });
    expect(w.transfer).toHaveBeenCalledWith({
      to: "lel1abc",
      amount: 50n,
      asset: undefined,
      autoConsolidate: true,
    });

    await a.transfer({ to: "lel1abc", amount: 50n, asset: 7n });
    expect(w.transfer).toHaveBeenLastCalledWith({
      to: "lel1abc",
      amount: 50n,
      asset: 7n,
      autoConsolidate: true,
    });
  });

  it("withdraw forwards to + amount + optional asset with autoConsolidate", async () => {
    const w = fakeWallet();
    const a = createSdkActions(w, CHAIN);
    await a.withdraw({ to: RECIPIENT, amount: 1n });
    expect(w.withdraw).toHaveBeenCalledWith({
      to: RECIPIENT,
      amount: 1n,
      asset: undefined,
      autoConsolidate: true,
    });

    await a.withdraw({ to: RECIPIENT, amount: 1n, asset: 2n });
    expect(w.withdraw).toHaveBeenLastCalledWith({
      to: RECIPIENT,
      amount: 1n,
      asset: 2n,
      autoConsolidate: true,
    });
  });

  it("withdrawEth forwards to + amount + asset to wallet.withdrawEth with autoConsolidate", async () => {
    const w = fakeWallet();
    const a = createSdkActions(w, CHAIN);
    await a.withdrawEth({ to: RECIPIENT, amount: 1n, asset: 2n });
    expect(w.withdrawEth).toHaveBeenCalledWith({
      to: RECIPIENT,
      amount: 1n,
      asset: 2n,
      autoConsolidate: true,
    });
  });

  it("propagates rejections from underlying wallet", async () => {
    const deposit = vi.fn().mockRejectedValue(new Error("boom"));
    const a = createSdkActions({ deposit } as unknown as WalletApi, CHAIN);
    await expect(a.deposit({ amount: 1n })).rejects.toThrow("boom");
  });
});
