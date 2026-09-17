import { priceOf, usePrices } from "@/features/assets";
import { FeeLineSummary, type FeePanel, feeRowsOf, feeTotalUsd } from "@/features/fees";
import { formatUsd } from "@/shared/lib/format/money";
import { WideNarrow } from "@/shared/ui/WideNarrow";

/// The closed Details row: fees in dollars, or in tokens when unpriced or cross-asset.
export function DepositFeeSummary({ fees }: { fees: FeePanel }) {
  const prices = usePrices();
  const hasFees = !!fees.model && feeRowsOf(fees.model).length > 0 && !fees.model.crossAsset;
  const usd = hasFees ? feeTotalUsd(fees.model, (t) => priceOf(prices, t)) : undefined;
  if (usd === undefined) return <FeeLineSummary model={fees.model} />;
  const text = formatUsd(usd);
  const figure = text.startsWith("<") ? text : `≈ ${text}`;
  return (
    <>
      <WideNarrow wide="Total fees" narrow="Fees" /> {figure}
    </>
  );
}
