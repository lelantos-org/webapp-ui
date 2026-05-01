import { z } from "zod";
import { isDecimalString, isPositiveIntegerString } from "@/shared/lib/format";

const amount = z.string().refine(isDecimalString, "must be a positive number");
const asset = z.string().refine(isPositiveIntegerString, "must be a positive integer");

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
  .refine((v) => v.assetIn !== v.assetOut, {
    message: "tokenIn and tokenOut must differ",
    path: ["assetOut"],
  });

export type SwapInput = z.infer<typeof swapSchema>;
