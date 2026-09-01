import { zodResolver } from "@hookform/resolvers/zod";
import { act, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { type SwapInput, swapSchema } from "./schemas";

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
      result.current.form.setValue("assetIn", "2");
      result.current.form.setValue("assetOut", "1");
      await result.current.form.trigger(["assetIn", "assetOut"]);
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
