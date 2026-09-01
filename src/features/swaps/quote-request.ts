// Deciding whether the form is holding a quotable trade, and describing it.
//
// Pure and separate from the component, because "is this quotable" is the
// predicate the whole submit path rests on: `undefined` keeps the query off,
// and since the request *is* the cache key, changing any part of it invalidates
// the previous quote by construction. Getting it wrong does not misrender
// anything — it quotes a route the proof will not match.

import type { RegisteredAsset } from "@/config/chains";
import type { QuoteRequest } from "./use-swap-quote";

export interface QuoteRequestInput {
  chainId: bigint;
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

/// The quote to fetch, or `undefined` when the form is not holding a complete,
/// valid, non-degenerate trade.
///
/// MetaQuoter quotes against token base units, hence `amount * scale`. MASP
/// skims its fee off the gross publicOut before the wrapper sees the input, so
/// the adapter-side input is slightly lower; the user's `slippageBps` floor
/// absorbs the difference.
export function quoteRequest({
  chainId,
  inAsset,
  outAsset,
  amount,
  amountValid,
  slippageBps,
}: QuoteRequestInput): QuoteRequest | undefined {
  if (!inAsset || !outAsset) return undefined;
  // A pair of the same asset is not a trade, and MetaQuoter has no route for
  // it. Compared by id rather than by address, matching `swapSchema`'s refine.
  if (inAsset.id === outAsset.id) return undefined;
  if (!amountValid || amount === undefined) return undefined;
  return {
    chainId,
    tokenIn: inAsset.token,
    tokenOut: outAsset.token,
    amountIn: amount * inAsset.scale,
    slippageBps,
  };
}
