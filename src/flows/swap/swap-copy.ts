// The words the swap form puts around the trade, derived from the figures
// behind it.
//
// Pure, so the Details row, the footnote and the venue badge are testable
// without a quote query or a fee panel.

import type { SwapQuote } from "@lelantos-org/sdk/quoter";
import { type FeeSummaryModel, feeRowsOf, sumByAsset } from "@/features/fees";
import { formatBaseFixed } from "@/shared/lib/format/asset";
import { formatBps } from "@/shared/lib/format/money";

const VENUES: Record<SwapQuote["venue"], string> = {
  univ3: "Uniswap v3",
  univ4: "Uniswap v4",
};

/// "Uniswap v3" for the quoter's `univ3`. An id this build does not know is
/// shown as sent rather than hidden: the badge says where the trade routes.
export function venueLabel(venue: string): string {
  return (VENUES as Record<string, string>)[venue] ?? venue;
}

/// "0.50%", "1.0%": two places under one percent, where the difference between
/// 0.10 and 0.50 is the whole choice.
export function slippagePct(bps: number): string {
  return formatBps(bps, bps < 100 ? 2 : 1);
}

/// The fee half of the Details summary: "fees 1.20 USDC", or what stands in for
/// it while there is nothing to state. `undefined` with nothing typed, when the
/// row carries the slippage alone.
///
/// Figures at two places at least. Per asset, joined with
/// "+" when the relayer is paid in another token: adding two tokens' base units
/// would be a number that means nothing.
export function swapFeeSummary(model: FeeSummaryModel | undefined): string | undefined {
  if (!model) return undefined;
  const fees = feeRowsOf(model);
  if (fees.length === 0) return "no fees";
  if (fees.some((r) => r.amount === undefined)) return "fees…";
  const parts = sumByAsset(fees).map(({ amount, asset }) => formatBaseFixed(amount, asset, 6));
  return `fees ${parts.join(" + ")}`;
}

/// The closed Details row: "Max slippage 0.50% · fees 1.20 USDC".
export function swapDetailsLine(
  bps: number,
  model: FeeSummaryModel | undefined,
  { short = false }: { short?: boolean } = {},
): string {
  const slip = `${short ? "Slippage" : "Max slippage"} ${slippagePct(bps)}`;
  const fee = swapFeeSummary(model);
  return fee ? `${slip} · ${fee}` : slip;
}

/// Under the Swap button while nothing blocks it.
export function revertFootnote(bps: number): string {
  return `The trade reverts if the price moves more than ${slippagePct(bps)} before it executes.`;
}

/// Which line goes under "You receive".
export type ReceiveLine = "quote-failed" | "stale" | "credited" | "pricing" | "fetching" | "empty";

/// The line for the quote as it stands, most pressing first: a failure with
/// nothing to show, an expired quote, the credited figure, a quote still being
/// sized into what reaches the balance, a request in flight, or nothing asked.
export function receiveLine(s: {
  quoted: boolean;
  credited: boolean;
  error: unknown;
  stale: boolean;
  quoting: boolean;
}): ReceiveLine {
  if (s.error && !s.quoted) return "quote-failed";
  if (s.stale) return "stale";
  if (s.credited) return "credited";
  if (s.quoted) return "pricing";
  return s.quoting ? "fetching" : "empty";
}
