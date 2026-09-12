// @vitest-environment jsdom
import { zodResolver } from "@hookform/resolvers/zod";
import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { makeAsset } from "@/test/fixtures/assets";
import { defaultSwapOut, flipPair, type SwapInput, swapSchema } from "./schema";

/// How the flip control has to write the pair.
///
/// `swapSchema` reports a matching pair on *both* field paths, deliberately —
/// see the comment there. That makes the order of writes load-bearing: writing
/// each side with `shouldValidate` passes through a state where both sides are
/// momentarily the same, and the second write clears only the field it names.
/// The first field keeps an error describing a pair that no longer exists, and
/// the submit button stays dead behind it.
///
/// `formState.errors` is read during render here on purpose. It is a
/// subscription proxy: reading it only after `act` never subscribes, so the
/// errors always look empty and a test written that way passes against the bug.
function setup() {
  return renderHook(() => {
    const form = useForm<SwapInput>({
      resolver: zodResolver(swapSchema),
      // A valid amount matters: zod runs `.refine()` only once the object
      // itself parses, so an empty amount masks every pair error behind it.
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

    // The shipped bug, pinned so the fix below cannot be "simplified" back into
    // two validated writes. The pair ends up valid; the error does not.
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

  // The regression this replaces: the out-side was the literal "2", so a chain
  // whose registry skips that id resolved to no asset, and the form silently
  // never built a quote request.
  it("does not assume asset id 2 exists", () => {
    expect(
      defaultSwapOut([makeAsset(1n, "WETH"), makeAsset(7n, "USDC"), makeAsset(9n, "WBTC")]),
    ).toBe("7");
  });

  it("skips the default wherever it sits in the list", () => {
    expect(defaultSwapOut([makeAsset(5n, "USDC"), makeAsset(1n, "WETH")])).toBe("5");
  });

  it("falls back to the default when the chain has one asset", () => {
    // No valid pair exists. Returning the from-side default leaves the pair
    // matching, which is what keeps the quote request undefined and the form
    // inert — the honest outcome for a chain that cannot swap.
    expect(defaultSwapOut([makeAsset(1n, "WETH")])).toBe("1");
  });

  it("falls back to the default for an empty registry", () => {
    expect(defaultSwapOut([])).toBe("1");
  });
});
