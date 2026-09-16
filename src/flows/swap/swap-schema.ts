import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import type { RegisteredAsset } from "@/config/chains";
import { DEFAULT_ASSET_ID } from "@/features/assets";
import { amountField as amount, assetField as asset } from "@/features/op-form";

/// The slippage the form opens on, in basis points.
export const DEFAULT_SLIPPAGE_BPS = 50;

export const swapSchema = z
  .object({
    assetIn: asset.default(DEFAULT_ASSET_ID),
    assetOut: asset,
    amount,
    slippageBps: z
      .number({ coerce: true })
      .int()
      .min(1, "min 1 bps")
      .max(5000, "max 5000 bps")
      .default(DEFAULT_SLIPPAGE_BPS),
  })
  // Reported on *both* fields. With the error on `assetOut` alone, changing
  // `assetIn` to match `assetOut` produced no message at all: the pickers call
  // `setValue(..., { shouldValidate: true })` for the field being changed, so
  // only that field's errors are surfaced. The symptom was "get quote" going
  // dead with nothing on screen to explain it.
  .superRefine((v, ctx) => {
    if (v.assetIn === v.assetOut) {
      for (const path of ["assetOut", "assetIn"]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "tokenIn and tokenOut must differ",
          path: [path],
        });
      }
    }
  });

export type SwapInput = z.infer<typeof swapSchema>;

/// The asset the "to" side starts on.
///
/// This was the literal `"2"`. Asset ids are per-chain, so on any chain whose
/// registry has no id 2 that default resolved to no asset at all — and because
/// the quote request is only built once both sides resolve, the form sat there
/// looking complete and silently never quoted. Nothing surfaced it: there is no
/// error state for "the default you were given does not exist".
///
/// Picking the first asset that is not the "from" default keeps the pair
/// distinct, which is what the form needs to build a request at all. With fewer
/// than two assets there is no valid pair to offer; returning the default is
/// honest about that — the chain cannot swap, and the form stays inert rather
/// than pointing at something imaginary.
export function defaultSwapOut(assets: readonly RegisteredAsset[]): string {
  const other = assets.find((a) => a.id.toString() !== DEFAULT_ASSET_ID);
  return other ? other.id.toString() : DEFAULT_ASSET_ID;
}

/// Write the pair swapped, then revalidate both sides together.
///
/// Both sides are written unvalidated and revalidated together afterwards.
/// Validating each `setValue` as it lands walks through a state where the two
/// sides are momentarily equal, and `swapSchema` reports that on *both* paths by
/// design (see the comment there). The second write then clears only the field it
/// names, leaving the first field's "tokenIn and tokenOut must differ" latched on
/// a pair that is now perfectly valid.
///
/// Resolves with the revalidation's verdict; the form does not need to wait on it.
export function flipPair(
  form: Pick<UseFormReturn<SwapInput>, "setValue" | "trigger">,
  pair: Pick<SwapInput, "assetIn" | "assetOut">,
): Promise<boolean> {
  form.setValue("assetIn", pair.assetOut);
  form.setValue("assetOut", pair.assetIn);
  return form.trigger(["assetIn", "assetOut"]);
}
