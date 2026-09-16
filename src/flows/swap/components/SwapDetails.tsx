import { FeeDetails, type FeePanel } from "@/features/fees";
import { WideNarrow } from "@/shared/ui/WideNarrow";
import { swapDetailsLine } from "../swap-copy";
import { SlippageField } from "./SlippageField";

export interface SwapDetailsProps {
  fees: FeePanel;
  slippageBps: number;
  onSlippageChange(bps: number): void;
  slippageError: string | undefined;
}

/// The Details row: slippage and the relayer fee, closed to one line.
export function SwapDetails({
  fees,
  slippageBps,
  onSlippageChange,
  slippageError,
}: SwapDetailsProps) {
  return (
    <FeeDetails
      fees={fees}
      summary={
        <WideNarrow
          wide={swapDetailsLine(slippageBps, fees.model)}
          narrow={swapDetailsLine(slippageBps, fees.model, { short: true })}
        />
      }
    >
      <SlippageField bps={slippageBps} onChange={onSlippageChange} error={slippageError} />
    </FeeDetails>
  );
}
