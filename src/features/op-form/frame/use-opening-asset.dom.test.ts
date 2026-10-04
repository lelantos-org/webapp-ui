import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { makeAsset } from "@/test/fixtures/assets";
import { useActionForm } from "./use-action-form";
import { useAskedAsset, useHeldAssetDefault } from "./use-opening-asset";

const USDC = makeAsset(1n, "USDC", { decimals: 6 });
const WETH = makeAsset(2n, "WETH");

const reads = vi.hoisted(() => ({
  balances: undefined as { asset: bigint; balance: bigint }[] | undefined,
  lastUsed: undefined as string | undefined,
}));
vi.mock("@/features/assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/assets")>()),
  useRegisteredAssets: () => [USDC, WETH],
  useBalances: () => ({ data: reads.balances && { balances: reads.balances }, isLoading: false }),
  usePrices: () => new Map(),
  useLastUsedAsset: () => reads.lastUsed,
}));

const schema = z.object({ amount: z.string(), asset: z.string() });
type Values = z.infer<typeof schema>;

function open(opening: typeof useHeldAssetDefault = useHeldAssetDefault) {
  const mutation = { reset: vi.fn() } as never;
  const progress = { done: false, reset: vi.fn() } as never;
  return renderHook(() => {
    const api = useActionForm<Values, unknown, unknown>({
      schema,
      defaultValues: { amount: "", asset: "1" },
      action: { mutation, progress },
    });
    opening(api);
    return api;
  });
}

const asset = (h: ReturnType<typeof open>) => h.result.current.form.getValues("asset");

beforeEach(() => {
  reads.balances = undefined;
  reads.lastUsed = undefined;
  window.history.replaceState(null, "", "/send");
});

describe("useHeldAssetDefault", () => {
  it("opens on the holding once the balances are in", () => {
    const h = open();
    expect(asset(h)).toBe("1");

    reads.balances = [{ asset: 2n, balance: 5n }];
    h.rerender();
    expect(asset(h)).toBe("2");
  });

  it("prefers the asset the URL names to any holding", () => {
    window.history.replaceState(null, "", "/send?asset=2");
    reads.balances = [{ asset: 1n, balance: 5n }];
    expect(asset(open())).toBe("2");
  });

  it("decides once: a later balance does not move the asset under the user", () => {
    reads.balances = [{ asset: 2n, balance: 5n }];
    const h = open();
    reads.balances = [{ asset: 1n, balance: 5n }];
    h.rerender();
    expect(asset(h)).toBe("2");
  });

  it("leaves a form the user has already typed an amount into", () => {
    const h = open();
    act(() => h.result.current.setAmount("3"));
    reads.balances = [{ asset: 2n, balance: 5n }];
    h.rerender();
    expect(asset(h)).toBe("1");
  });

  it("leaves an asset the user picked", () => {
    const h = open();
    act(() => h.result.current.setValue("asset", "1", { shouldDirty: true }));
    act(() => h.result.current.setValue("asset", "2", { shouldDirty: true }));
    reads.balances = [{ asset: 1n, balance: 5n }];
    h.rerender();
    expect(asset(h)).toBe("2");
  });
});

describe("useAskedAsset", () => {
  it("follows the URL and nothing else", () => {
    reads.balances = [{ asset: 2n, balance: 5n }];
    expect(asset(open(useAskedAsset))).toBe("1");

    window.history.replaceState(null, "", "/shield?asset=2");
    expect(asset(open(useAskedAsset))).toBe("2");
  });
});
