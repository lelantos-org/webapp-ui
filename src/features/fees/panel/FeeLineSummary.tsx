import { WideNarrow } from "@/shared/ui/WideNarrow";
import { feeLine } from "../model/fee-copy";
import type { FeeSummaryModel } from "../model/fee-summary";

/// The Details row's fee line in wide and narrow forms, switched by CSS.
export function FeeLineSummary({ model }: { model: FeeSummaryModel | undefined }) {
  return <WideNarrow wide={feeLine(model)} narrow={feeLine(model, { short: true })} />;
}
