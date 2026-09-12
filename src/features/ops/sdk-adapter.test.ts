// @vitest-environment jsdom
import { DEFAULT_ASSET as SDK_DEFAULT_ASSET } from "@lelantos-org/sdk/wallet";
import { describe, expect, it, vi } from "vitest";
import { asCircuitUnits } from "@/shared/domain/units";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { makeChain } from "@/test/fixtures/chains";
import { createSdkActions } from "./sdk-adapter";

// The adapter brands L1 recipients via `evmAddress`, which requires a
// 20-byte 0x-prefixed address.
const RECIPIENT = "0x000000000000000000000000000000000000dead";

/// `makeChain` sets no `swapWrapperAddress`, matching a chain with no wrapper
/// deployed.
const CHAIN = makeChain({ chainName: "local" });

function fakeWallet() {
  const deposit = vi.fn().mockResolvedValue({ txHash: "0xdep" });
  const transfer = vi.fn().mockResolvedValue({ txHash: "0xtx" });
  const withdraw = vi.fn().mockResolvedValue({ txHash: "0xwd" });
  const withdrawEth = vi.fn().mockResolvedValue({ txHash: "0xwdeth" });
  return fakeWalletApi({ deposit, transfer, withdraw, withdrawEth });
}

describe("createSdkActions", () => {
  it("deposit forwards amount + optional asset to wallet.deposit", async () => {
    const w = fakeWallet();
    const a = createSdkActions(w, CHAIN);
    const r = await a.deposit({ amount: asCircuitUnits(100n) });
    expect(r.txHash).toBe("0xdep");
    expect(w.deposit).toHaveBeenCalledWith({ amount: asCircuitUnits(100n), asset: undefined });

    await a.deposit({ amount: asCircuitUnits(100n), asset: 2n });
    expect(w.deposit).toHaveBeenLastCalledWith({ amount: asCircuitUnits(100n), asset: 2n });
  });

  it.each([
    ["transfer", "lel1abc"],
    ["withdraw", RECIPIENT],
  ] as const)("%s forwards to + amount + optional asset with autoConsolidate", async (op, to) => {
    const w = fakeWallet();
    const a = createSdkActions(w, CHAIN);
    const amount = asCircuitUnits(50n);

    await a[op]({ to, amount });
    expect(w[op]).toHaveBeenCalledWith({ to, amount, asset: undefined, autoConsolidate: true });

    await a[op]({ to, amount, asset: 7n });
    expect(w[op]).toHaveBeenLastCalledWith({ to, amount, asset: 7n, autoConsolidate: true });
  });

  it("withdrawEth forwards to + amount + asset to wallet.withdrawEth with autoConsolidate", async () => {
    const w = fakeWallet();
    const a = createSdkActions(w, CHAIN);
    await a.withdrawEth({ to: RECIPIENT, amount: asCircuitUnits(1n), asset: 2n });
    expect(w.withdrawEth).toHaveBeenCalledWith({
      to: RECIPIENT,
      amount: asCircuitUnits(1n),
      asset: 2n,
      autoConsolidate: true,
    });
  });

  // The tag names the asset the pending overlay credits. It has to be the one
  // the SDK moved when none was named, which is the SDK's own default.
  it("tags an op submitted without an asset with the SDK's default asset", async () => {
    const a = createSdkActions(fakeWallet(), CHAIN);
    expect((await a.deposit({ amount: asCircuitUnits(1n) })).asset).toBe(SDK_DEFAULT_ASSET);
    expect((await a.transfer({ to: "lel1abc", amount: asCircuitUnits(1n) })).asset).toBe(
      SDK_DEFAULT_ASSET,
    );
    expect((await a.withdraw({ to: RECIPIENT, amount: asCircuitUnits(1n) })).asset).toBe(
      SDK_DEFAULT_ASSET,
    );
    expect((await a.transfer({ to: "lel1abc", amount: asCircuitUnits(1n), asset: 7n })).asset).toBe(
      7n,
    );
  });

  it("propagates rejections from underlying wallet", async () => {
    const deposit = vi.fn().mockRejectedValue(new Error("boom"));
    const a = createSdkActions(fakeWalletApi({ deposit }), CHAIN);
    await expect(a.deposit({ amount: asCircuitUnits(1n) })).rejects.toThrow("boom");
  });
});
