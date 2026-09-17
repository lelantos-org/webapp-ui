import { zodResolver } from "@hookform/resolvers/zod";
import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { defaultSwapOut, flipPair, type SwapInput, swapSchema } from "./swap-schema";

// Read `formState.errors` during render: reading only after `act` never subscribes the proxy.
function setup() {
  return renderHook(() => {
    const form = useForm<SwapInput>({
      resolver: zodResolver(swapSchema),
      // Needs a valid amount: zod skips the refine until the object parses.
      defaultValues: { assetIn: "1", assetOut: "2", amount: "1.0", slippageBps: 50 },
    });
    const { errors } = form.formState;
    return { form, errors };
  });
}

describe("swap pair flip", () => {
  it("latches a stale error when each side is validated as it is written", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.form.setValue("assetIn", "2", { shouldValidate: true });
      result.current.form.setValue("assetOut", "1", { shouldValidate: true });
    });

    expect(result.current.errors.assetIn?.message).toBe("tokenIn and tokenOut must differ");
    expect(result.current.form.getValues()).toMatchObject({ assetIn: "2", assetOut: "1" });
  });

  it("leaves no error when both sides are written and then revalidated together", async () => {
    const { result } = setup();

    await act(async () => {
      await flipPair(result.current.form, { assetIn: "1", assetOut: "2" });
    });

    expect(result.current.errors.assetIn).toBeUndefined();
    expect(result.current.errors.assetOut).toBeUndefined();
    expect(result.current.form.getValues()).toMatchObject({ assetIn: "2", assetOut: "1" });
  });

  it("still reports a pair that genuinely matches", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.form.setValue("assetOut", "1");
      await result.current.form.trigger(["assetIn", "assetOut"]);
    });

    expect(result.current.errors.assetIn?.message).toBe("tokenIn and tokenOut must differ");
  });
});

describe("defaultSwapOut", () => {
  it("picks the first asset that is not the from-side default", () => {
    expect(defaultSwapOut([makeAsset(1n, "WETH"), makeAsset(2n, "mDAI")])).toBe("2");
  });

  it("does not assume asset id 2 exists", () => {
    expect(
      defaultSwapOut([makeAsset(1n, "WETH"), makeAsset(7n, "USDC"), makeAsset(9n, "WBTC")]),
    ).toBe("7");
  });

  it("skips the default wherever it sits in the list", () => {
    expect(defaultSwapOut([makeAsset(5n, "USDC"), makeAsset(1n, "WETH")])).toBe("5");
  });

  it("falls back to the default when the chain has one asset", () => {
    expect(defaultSwapOut([makeAsset(1n, "WETH")])).toBe("1");
  });

  it("falls back to the default for an empty registry", () => {
    expect(defaultSwapOut([])).toBe("1");
  });
});
