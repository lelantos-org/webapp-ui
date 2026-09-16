// @vitest-environment jsdom
import { circuitAmount, evmAddress } from "@lelantos-org/sdk";
import { describe, expect, it, vi } from "vitest";
import type { TxPhase } from "@/features/tx";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { createSdkActions, depositStep, spendStep } from "./sdk-adapter";

const RECIPIENT = "0x000000000000000000000000000000000000dead";

function fakeWallet() {
  const deposit = vi.fn().mockResolvedValue({ txHash: "0xdep" });
  const transfer = vi.fn().mockResolvedValue({ txHash: "0xtx" });
  const withdraw = vi.fn().mockResolvedValue({ txHash: "0xwd" });
  const swap = vi.fn().mockResolvedValue({ txHash: "0xsw" });
  return fakeWalletApi({ deposit, transfer, withdraw, swap });
}

/// The options object the SDK method received on its last call.
function lastArgs(fn: unknown): Record<string, unknown> {
  return (fn as ReturnType<typeof vi.fn>).mock.lastCall?.[0];
}

describe("createSdkActions", () => {
  it("deposit names the asset and forwards a fee asset only off the native path", async () => {
    const w = fakeWallet();
    const a = createSdkActions(w);
    const amount = circuitAmount(100n);

    await expect(a.deposit({ amount, asset: 2n, native: false })).resolves.toEqual({
      txHash: "0xdep",
    });
    expect(lastArgs(w.deposit)).toEqual({ amount, asset: 2n, native: false });

    await a.deposit({ amount, asset: 2n, native: false, feeAsset: 3n });
    expect(lastArgs(w.deposit)).toEqual({ amount, asset: 2n, native: false, feeAsset: 3n });

    await a.deposit({ amount, asset: 2n, native: true, feeAsset: 3n });
    expect(lastArgs(w.deposit)).toEqual({ amount, asset: 2n, native: true });
  });

  it("transfer forwards recipient, amount and asset with autoConsolidate", async () => {
    const w = fakeWallet();
    const amount = circuitAmount(50n);
    await createSdkActions(w).transfer({ recipient: "lel1abc", amount, asset: 7n });
    expect(lastArgs(w.transfer)).toEqual({
      recipient: "lel1abc",
      amount,
      asset: 7n,
      feeAsset: undefined,
      autoConsolidate: true,
    });
  });

  it("withdraw sends the form's amount as gross and carries the native flag", async () => {
    const w = fakeWallet();
    const gross = circuitAmount(1n);
    await createSdkActions(w).withdraw({
      recipient: RECIPIENT,
      gross,
      asset: 2n,
      native: true,
      feeAsset: 3n,
    });
    expect(lastArgs(w.withdraw)).toEqual({
      recipient: evmAddress(RECIPIENT),
      gross,
      asset: 2n,
      native: true,
      feeAsset: 3n,
      autoConsolidate: true,
    });
  });

  it("swap passes the quote through", async () => {
    const w = fakeWallet();
    const quote = { kind: "swapQuote" } as never;
    await createSdkActions(w).swap({ quote });
    expect(lastArgs(w.swap)).toMatchObject({ quote, autoConsolidate: true });
  });

  it("translates SDK phases into stepper phases, dropping the ones not shown", async () => {
    const w = fakeWallet();
    const seen: TxPhase[] = [];
    await createSdkActions(w).transfer({
      recipient: "lel1abc",
      amount: circuitAmount(1n),
      asset: 1n,
      onPhase: (p) => seen.push(p),
    });
    const onPhase = lastArgs(w.transfer).onPhase as (p: string) => void;
    for (const p of [
      "preparing",
      "consolidating",
      "preparing",
      "proving",
      "submitting",
      "confirmed",
    ])
      onPhase(p);
    expect(seen).toEqual(["preparing", "preparing", "preparing", "proving", "submitting"]);
  });

  it("propagates rejections from the underlying wallet", async () => {
    const deposit = vi.fn().mockRejectedValue(new Error("boom"));
    const a = createSdkActions(fakeWalletApi({ deposit }));
    await expect(
      a.deposit({ amount: circuitAmount(1n), asset: 1n, native: false }),
    ).rejects.toThrow("boom");
  });
});

describe("phase mapping", () => {
  it("maps a deposit's confirmation to inclusion, before the flush", () => {
    expect(depositStep("preparing")).toBeUndefined();
    expect(depositStep("signing")).toBe("signing");
    expect(depositStep("broadcast")).toBe("broadcast");
    expect(depositStep("confirmed")).toBe("mined");
  });

  it("leaves a spend's confirmation to the lifecycle", () => {
    expect(spendStep("consolidating")).toBe("preparing");
    expect(spendStep("confirmed")).toBeUndefined();
  });
});
