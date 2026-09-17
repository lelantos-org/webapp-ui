import type { RegisteredAsset } from "@/config/chains";
import { RaysGlyph } from "@/shared/ui/icons/glyphs";
import { Notice } from "@/shared/ui/Notice";
import { depositSetupCopy } from "../setup-copy";

export interface SetupNoticeProps {
  assets: readonly RegisteredAsset[];
  /// `SetupNeeds.willApproveErc20`: the run sends an ERC-20 → Permit2 approval first.
  willApproveErc20: boolean;
  /// The allowances could not be read; setup is still offered.
  unknown?: boolean;
  onRun(): void;
}

/// Standing prompt while a deposit is blocked on Permit2 setup.
export function SetupNotice({
  assets,
  willApproveErc20,
  unknown = false,
  onRun,
}: SetupNoticeProps) {
  const { title, body } = depositSetupCopy(
    assets.map((a) => a.symbol),
    { unknown, willApproveErc20 },
  );
  return (
    <Notice tone="accent" icon={<SetupTile />} title={title} actionLabel="Set up" onAction={onRun}>
      {body}
    </Notice>
  );
}

/// The setup card's leading mark: rays in `Notice`'s accent tile.
export function SetupTile() {
  return (
    <span className="notice__tile">
      <RaysGlyph size={17} />
    </span>
  );
}
