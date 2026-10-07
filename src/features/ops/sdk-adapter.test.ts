import { circuitAmount, evmAddress } from "@lelantos-org/sdk";
import { describe, expect, it, vi } from "vitest";
import type { TxPhase } from "@/features/tx";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { createSdkActions, depositStep, spendPhases, spendStep, spendSteps } from "./sdk-adapter";

/// Whether the prover is already fetched; `load` settles a fetch in flight.
const prover = vi.hoisted(() => ({ loaded: true, load: Promise.resolve() }));
vi.mock("@/features/wallet", () => ({
  isProverLoaded: () => prover.loaded,
  whenProverLoaded: () => prover.load,
}));

const RECIPIENT = "0x000000000000000000000000000000000000dead";

function fakeWallet() {
  const deposit = vi.fn().mockResolvedValue({ txHash: "0xdep" });
  const transfer = vi.fn().mockResolvedValue({ txHash: "0xtx" });
  const withdraw = vi.fn().mockResolvedValue({ txHash: "0xwd" });
  const swap = vi.fn().mockResolvedValue({ txHash: "0xsw" });
  const registerName = vi.fn().mockResolvedValue({ txHash: "0xrn" });
  return fakeWalletApi({ deposit, transfer, withdraw, swap, registerName });
}

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

  it("caps the relayer fee at the reviewed fee on every spend", async () => {
    const w = fakeWallet();
    const a = createSdkActions(w);
    const maxFee = circuitAmount(9n);
    const amount = circuitAmount(1n);

    await a.transfer({ recipient: "lel1abc", amount, asset: 7n, maxFee });
    expect(lastArgs(w.transfer)).toMatchObject({ maxFee });

    await a.withdraw({ recipient: RECIPIENT, gross: amount, asset: 2n, native: false, maxFee });
    expect(lastArgs(w.withdraw)).toMatchObject({ maxFee });

    await a.swap({ quote: { kind: "swapQuote" } as never, maxFee });
    expect(lastArgs(w.swap)).toMatchObject({ maxFee });
  });

  it("registerName forwards the label and names no account", async () => {
    const w = fakeWallet();
    await expect(createSdkActions(w).registerName({ label: "mehow" })).resolves.toEqual({
      txHash: "0xrn",
    });
    expect(lastArgs(w.registerName)).toEqual({
      label: "mehow",
      asset: undefined,
      feeAsset: undefined,
      maxFee: undefined,
      autoConsolidate: true,
      onPhase: undefined,
    });

    await createSdkActions(w).registerName({ label: "mehow", asset: 3n });
    expect(lastArgs(w.registerName)).toMatchObject({ label: "mehow", asset: 3n });
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
    // The merge is its own step, and picking funds again after it does not step back.
    expect(seen).toEqual(["preparing", "consolidating", "proving", "submitting"]);
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

  it("shows a merge as its own step and leaves the confirmation to the lifecycle", () => {
    expect(spendStep("consolidating")).toBe("consolidating");
    expect(spendStep("confirmed")).toBeUndefined();
  });
});

describe("a spend whose prover is not fetched yet", () => {
  it("adds the download as a step of its own", () => {
    prover.loaded = false;
    expect(spendSteps("transfer").map((s) => s.id)).toEqual([
      "preparing",
      "fetching-prover",
      "proving",
      "submitting",
      "mined",
    ]);
    prover.loaded = true;
    expect(spendSteps("transfer").map((s) => s.id)).not.toContain("fetching-prover");
  });

  it("shows the wait as the download, and as proving only once it is done", async () => {
    let finish: () => void = () => {};
    prover.loaded = false;
    prover.load = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const seen: TxPhase[] = [];
    const onPhase = spendPhases((p) => seen.push(p));

    onPhase("preparing");
    onPhase("proving");
    expect(seen).toEqual(["preparing", "fetching-prover"]);

    finish();
    await prover.load;
    await Promise.resolve();
    expect(seen).toEqual(["preparing", "fetching-prover", "proving"]);

    prover.loaded = true;
    prover.load = Promise.resolve();
  });
});
