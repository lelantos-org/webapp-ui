import type { RegisteredAsset } from "@/config/chains";
import { findAsset } from "@/features/assets";
import { type ProgressView, useProveEta } from "@/features/tx";
import { formatAmountForAsset } from "@/shared/lib/format/asset";
import { joinHint } from "@/shared/lib/format/text";
import { TxProgressCard } from "@/shared/ui/tx-cards/TxProgressCard";
import type { Phase } from "../phase-machine";

export interface SweepingCardProps {
  phase: Extract<Phase, { kind: "sweeping" }>;
  /// The link chain's tokens, which label the amount.
  assets: readonly RegisteredAsset[];
  progress: ProgressView;
}

/// The claim in flight: the same steps a transfer shows, since that is what it is.
export function SweepingCard({ phase, assets, progress }: SweepingCardProps) {
  const eta = useProveEta(progress.provingSince);
  const asset = findAsset(assets, phase.asset);
  const amount = asset ? `${formatAmountForAsset(phase.amount, asset)} ${asset.symbol}` : undefined;
  return (
    <TxProgressCard
      title="Claiming"
      subtitle={joinHint(amount, eta)}
      steps={progress.steps}
      current={progress.phase}
      note="Keep this tab open until the claim is handed to the relayer."
    />
  );
}
