import { WideNarrow } from "@/shared/ui/WideNarrow";
import { feeLine } from "../model/fee-copy";
import type { FeeSummaryModel } from "../model/fee-summary";

/// The Details row's summary in both lengths — "Total fees 0.25 USDC · paid in
/// USDC" and, on phones, "Fees 0.25 USDC · in USDC" — switched by CSS rather than
/// a media-query hook, so the first render is already the right one.
export function FeeLineSummary({ model }: { model: FeeSummaryModel | undefined }) {
  return <WideNarrow wide={feeLine(model)} narrow={feeLine(model, { short: true })} />;
}
