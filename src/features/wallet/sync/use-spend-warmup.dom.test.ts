import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWalletApi } from "@/test/fakes/wallet";
import { useSpendWarmup } from "./use-spend-warmup";

const h = vi.hoisted(() => ({
  balances: [] as { asset: bigint; balance: bigint; notes: number }[] | undefined,
  sync: vi.fn(async (_opts: unknown) => {}),
  preload: vi.fn(async () => {}),
}));
// One instance: the hook's effect is keyed on the wallet.
const wallet = fakeWalletApi({ address: "lelantos1me", sync: h.sync });

vi.mock("../session/context", () => ({ useWalletInstance: () => wallet }));
vi.mock("./use-wallet-state", () => ({
  useWalletState: () => ({ data: h.balances && { balances: h.balances } }),
}));
vi.mock("../prover/prover-worker", () => ({ preloadProverWorker: () => h.preload() }));

const FUNDED = [{ asset: 1n, balance: 5n, notes: 1 }];
const setSaveData = (saveData: boolean | undefined) =>
  Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData } });

beforeEach(() => {
  vi.clearAllMocks();
  setSaveData(undefined);
});
afterEach(() => {
  Reflect.deleteProperty(navigator, "connection");
});

describe("useSpendWarmup", () => {
  it("warms the prover and the tree once the wallet holds something", async () => {
    h.balances = FUNDED;
    renderHook(() => useSpendWarmup());
    await waitFor(() => expect(h.sync).toHaveBeenCalledWith({ scope: "full" }));
    expect(h.preload).toHaveBeenCalledOnce();
  });

  it("does nothing for an empty or unsynced wallet", async () => {
    for (const balances of [undefined, [], [{ asset: 1n, balance: 0n, notes: 0 }]]) {
      h.balances = balances;
      const { unmount } = renderHook(() => useSpendWarmup());
      await new Promise((resolve) => setTimeout(resolve, 10));
      unmount();
    }
    expect(h.sync).not.toHaveBeenCalled();
    expect(h.preload).not.toHaveBeenCalled();
  });

  it("leaves the proving key alone when the user is saving data", async () => {
    h.balances = FUNDED;
    setSaveData(true);
    renderHook(() => useSpendWarmup());
    await waitFor(() => expect(h.sync).toHaveBeenCalled());
    expect(h.preload).not.toHaveBeenCalled();
  });
});
