import { circuitAmount, type QuoteSwapOptions } from "@lelantos-org/sdk";
import type { RegisteredAsset } from "@/config/chains";

export interface QuoteRequestInput {
  inAsset: RegisteredAsset | undefined;
  outAsset: RegisteredAsset | undefined;
  /// The amount in the in-asset's circuit units.
  amount: bigint | undefined;
  /// The amount passes `validateAmount`, balance included.
  amountValid: boolean;
  slippageBps: number;
}

/// The `quoteSwap` arguments (amount as `gross`), or `undefined` unless the trade is complete and valid.
export function quoteRequest({
  inAsset,
  outAsset,
  amount,
  amountValid,
  slippageBps,
}: QuoteRequestInput): QuoteSwapOptions | undefined {
  if (!inAsset || !outAsset) return undefined;
  if (inAsset.id === outAsset.id) return undefined;
  if (!amountValid || amount === undefined) return undefined;
  return {
    assetIn: inAsset.id,
    assetOut: outAsset.id,
    gross: circuitAmount(amount),
    slippageBps,
  };
}
