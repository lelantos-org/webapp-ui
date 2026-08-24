import { z } from "zod";
import { amountField as amount, assetField as asset } from "@/features/actions/forms/schemas";

export const swapSchema = z
  .object({
    assetIn: asset.default("1"),
    assetOut: asset.default("2"),
    amount,
    slippageBps: z
      .number({ coerce: true })
      .int()
      .min(1, "min 1 bps")
      .max(5000, "max 5000 bps")
      .default(50),
  })
  // Reported on *both* fields. With the error on `assetOut` alone, changing
  // `assetIn` to match `assetOut` produced no message at all: the pickers call
  // `setValue(..., { shouldValidate: true })` for the field being changed, so
  // only that field's errors are surfaced. The symptom was "get quote" going
  // dead with nothing on screen to explain it.
  .refine((v) => v.assetIn !== v.assetOut, {
    message: "tokenIn and tokenOut must differ",
    path: ["assetOut"],
  })
  .refine((v) => v.assetIn !== v.assetOut, {
    message: "tokenIn and tokenOut must differ",
    path: ["assetIn"],
  });

export type SwapInput = z.infer<typeof swapSchema>;
