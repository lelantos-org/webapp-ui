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
  // On both fields: the pickers validate only the field they change.
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

/// The asset the "to" side starts on: the first that is not the "from" default.
export function defaultSwapOut(assets: readonly RegisteredAsset[]): string {
  const other = assets.find((a) => a.id.toString() !== DEFAULT_ASSET_ID);
  return other ? other.id.toString() : DEFAULT_ASSET_ID;
}

/// Write the pair swapped, then revalidate both sides together (per-write validation latches a stale error).
export function flipPair(
  form: Pick<UseFormReturn<SwapInput>, "setValue" | "trigger">,
  pair: Pick<SwapInput, "assetIn" | "assetOut">,
): Promise<boolean> {
  form.setValue("assetIn", pair.assetOut);
  form.setValue("assetOut", pair.assetIn);
  return form.trigger(["assetIn", "assetOut"]);
}
