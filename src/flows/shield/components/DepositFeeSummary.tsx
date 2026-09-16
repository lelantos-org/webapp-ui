import { priceOf, usePrices } from "@/features/assets";
import { FeeLineSummary, type FeePanel, feeRowsOf, feeTotalUsd } from "@/features/fees";
import { formatUsd } from "@/shared/lib/format/money";
import { WideNarrow } from "@/shared/ui/WideNarrow";

/// The closed Details row: the fees in dollars.
///
/// Falls back to the token line whenever a dollar figure would be a guess — a
/// fee still being priced, or an asset with no price. In both lengths, like
/// Send's: `FeeDetails`' own line is the long one only, and on a phone it
/// would wrap the Details row onto two lines.
///
/// A relayer paid in another token is stated in tokens too, per token —
/// "0.3 USDC + 0.42 DAI · relayer paid in DAI" — since one dollar figure would
/// hide that a second balance is drawn on.
export function DepositFeeSummary({ fees }: { fees: FeePanel }) {
  const prices = usePrices();
  const hasFees = !!fees.model && feeRowsOf(fees.model).length > 0 && !fees.model.crossAsset;
  const usd = hasFees ? feeTotalUsd(fees.model, (t) => priceOf(prices, t)) : undefined;
  if (usd === undefined) return <FeeLineSummary model={fees.model} />;
  const text = formatUsd(usd);
  // `<$0.01` already says it is approximate.
  const figure = text.startsWith("<") ? text : `≈ ${text}`;
  return (
    <>
      <WideNarrow wide="Total fees" narrow="Fees" /> {figure}
    </>
  );
}
