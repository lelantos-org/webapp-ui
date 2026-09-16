import type { RegisteredAsset } from "@/config/chains";
import { RaysGlyph } from "@/shared/ui/icons/glyphs";
import { Notice } from "@/shared/ui/Notice";
import { depositSetupCopy } from "../setup-copy";

export interface SetupNoticeProps {
  /// The tokens outstanding: the deposited one, the one paying the relayer, or
  /// both.
  assets: readonly RegisteredAsset[];
  /// The run will send an ERC-20 → Permit2 approval, so setup takes an extra
  /// on-chain step before the signature. `SetupNeeds.willApproveErc20`, which
  /// predicts the run; `needsErc20Approve` gates the deposit and can be false
  /// while the run still approves.
  willApproveErc20: boolean;
  /// The allowances could not be read. Setup is still offered, since running it
  /// is the way forward and withholding it would strand the deposit.
  unknown?: boolean;
  onRun(): void;
}

/// Standing prompt shown while a deposit is blocked on Permit2 setup. Persists
/// until the allowances cover the deposit, so dismissing the flow does not
/// strand the form behind a disabled submit button.
///
/// An accent card rather than a warning: setup is a step the
/// user takes once, not something that went wrong. The submit button's reason
/// line says that it is what the deposit is waiting on.
///
/// The underlying failure is logged rather than rendered: a viem revert runs to
/// several hundred characters of ABI and call data, obscuring the actionable
/// part.
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

/// The setup card's leading mark: a burst of rays in the accent
/// tile `Notice` provides. An invitation, not a warning — hence not the
/// triangle every warn box carries.
export function SetupTile() {
  return (
    <span className="notice__tile">
      <RaysGlyph size={17} />
    </span>
  );
}
