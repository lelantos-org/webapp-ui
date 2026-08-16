// Manual quote-fetch hook backing the Swaps tab. Form triggers via
// `mutate` on user click — auto-fetch on every keystroke would hammer
// MetaQuoter rate limits.

import { fetchSwapQuote, type SwapQuote, type SwapQuoteRequest } from "@lelantos-org/sdk/quoter";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { env } from "@/config/env";

export type QuoteRequest = SwapQuoteRequest;
export type QuoteMutation = UseMutationResult<SwapQuote, Error, QuoteRequest>;

export function useSwapQuote(): QuoteMutation {
  return useMutation<SwapQuote, Error, QuoteRequest>({
    mutationFn: (req) => {
      const baseUrl = env.metaquoterUrl;
      if (!baseUrl) throw new Error("VITE_METAQUOTER_URL not configured");
      return fetchSwapQuote(baseUrl, req);
    },
  });
}
