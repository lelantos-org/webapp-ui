// The fee panel folded into the Details row, with the one warning it can raise.
//
// One component, so four screens do not each rebuild it: the row
// states the resolved answer ("Total fees 0.25 USDC · paid in USDC"), the body
// itemises it with the fee asset picker on the relayer row, and a problem paying
// the relayer opens the row, tints it, and offers the fix in one tap — "Pay the
// fee in ETH" — where the relayer quoted an asset the wallet can cover.

import type { ReactNode } from "react";
import { formatAssetCompact } from "@/shared/lib/format/asset";
import { DetailsDisclosure } from "@/shared/ui/DetailsDisclosure";
import { Notice } from "@/shared/ui/Notice";
import { FeeSummary } from "./FeeSummary";
import { feeBlockReason } from "./fee-block";
import { feeLine } from "./fee-copy";
import type { FeePanel } from "./use-fee-panel";

export interface FeeDetailsProps {
  fees: FeePanel;
  /// Shown instead of the computed summary — Shield's "Total fees ≈ $0.42".
  summary?: ReactNode;
  /// Rows of the caller's own, under the fee rows — Swap's slippage.
  children?: ReactNode;
}

export function FeeDetails({ fees, summary, children }: FeeDetailsProps) {
  const { block, feeAsset } = fees;

  // The row's own summary names the problem while one stands, so a collapsed
  // row cannot read "Total fees 0.25 USDC" over a submit that will not go.
  let blockedSummary: string | undefined;
  if (block?.kind === "shortfall") {
    const fig = (v: bigint) => formatAssetCompact(v, block);
    blockedSummary = `Relayer fee ${fig(block.amount)} ${block.symbol} · you hold ${fig(block.balance)}`;
  } else if (block) {
    blockedSummary = "Relayer fee unavailable";
  }

  // The one-tap fix: only when the picker is offered, since switching asset
  // through anything else would be a choice the form cannot carry to the SDK.
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
