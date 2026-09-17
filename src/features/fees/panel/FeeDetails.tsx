import type { ReactNode } from "react";
import { formatAssetCompact } from "@/shared/lib/format/asset";
import { DetailsDisclosure } from "@/shared/ui/DetailsDisclosure";
import { Notice } from "@/shared/ui/Notice";
import { feeBlockReason } from "../model/fee-block";
import { feeLine } from "../model/fee-copy";
import { FeeSummary } from "./FeeSummary";
import type { FeePanel } from "./use-fee-panel";

/// Props for `FeeDetails`.
export interface FeeDetailsProps {
  fees: FeePanel;
  /// Replaces the computed summary line.
  summary?: ReactNode;
  /// Extra rows under the fee rows.
  children?: ReactNode;
}

/// The fee panel folded into a Details row, with its blocking warning and one-tap fix.
export function FeeDetails({ fees, summary, children }: FeeDetailsProps) {
  const { block, feeAsset } = fees;

  let blockedSummary: string | undefined;
  if (block?.kind === "shortfall") {
    const fig = (v: bigint) => formatAssetCompact(v, block);
    blockedSummary = `Relayer fee ${fig(block.amount)} ${block.symbol} · you hold ${fig(block.balance)}`;
  } else if (block) {
    blockedSummary = "Relayer fee unavailable";
  }

  const switchTo = feeAsset ? block?.alternative : undefined;

  return (
    <DetailsDisclosure
      summary={blockedSummary ?? summary ?? feeLine(fees.model)}
      tone={block ? "warn" : "neutral"}
      forceOpen={!!block}
    >
      {block ? (
        <Notice
          tone="warn"
          actionPlacement="below"
          {...(switchTo
            ? {
                actionLabel: `Pay the fee in ${switchTo.symbol}`,
                onAction: () => feeAsset?.onChange(switchTo.id),
              }
            : block.kind === "quote-failed"
              ? { actionLabel: "Try again", onAction: block.retry }
              : {})}
        >
          {feeBlockReason(block)}
        </Notice>
      ) : null}
      <FeeSummary
        variant="details"
        model={fees.model}
        refreshing={fees.refreshing}
        feeAsset={fees.feeAsset}
      />
      {children}
    </DetailsDisclosure>
  );
}
