// Deciding whether the form is holding a quotable trade, and describing it.
//
// Pure and separate from the component, because "is this quotable" is the
// predicate the whole submit path rests on: `undefined` keeps the query off,
// and since the request *is* the cache key, changing any part of it invalidates
// the previous quote by construction. Getting it wrong does not misrender
// anything — it quotes a trade the form is not holding.

import { circuitAmount, type QuoteSwapOptions } from "@lelantos-org/sdk";
import type { RegisteredAsset } from "@/config/chains";

export interface QuoteRequestInput {
  /// Resolved registry entries, or `undefined` while the pair is incomplete.
  inAsset: RegisteredAsset | undefined;
  outAsset: RegisteredAsset | undefined;
  /// The amount in the in-asset's circuit units, or `undefined` when the field
  /// does not parse.
  amount: bigint | undefined;
  /// Whether the amount passes `validateAmount` — in particular, whether it is
  /// covered by the balance.
  amountValid: boolean;
  slippageBps: number;
}

/// The `quoteSwap` arguments, or `undefined` when the form is not holding a
/// complete, valid, non-degenerate trade.
///
/// The typed amount is the swap's `gross`: the `publicOut` leaving the pool, the
/// figure the balance is checked against. The SDK derives what reaches the venue
/// from it (less the withdraw fee, through the yield index) exactly as the swap
/// will, so the form prices nothing itself.
export function quoteRequest({
  inAsset,
  outAsset,
  amount,
  amountValid,
  slippageBps,
}: QuoteRequestInput): QuoteSwapOptions | undefined {
  if (!inAsset || !outAsset) return undefined;
  // A pair of the same asset is not a trade, and MetaQuoter has no route for
  // it. Compared by id rather than by address, matching `swapSchema`'s refine.
  if (inAsset.id === outAsset.id) return undefined;
  if (!amountValid || amount === undefined) return undefined;
  return {
    assetIn: inAsset.id,
    assetOut: outAsset.id,
    gross: circuitAmount(amount),
    slippageBps,
  };
}
