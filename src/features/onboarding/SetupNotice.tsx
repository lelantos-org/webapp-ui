import type { RegisteredAsset } from "@/features/assets/registered-assets";
import { Notice } from "@/shared/ui/Notice";

export interface SetupNoticeProps {
  asset: RegisteredAsset;
  /// The ERC-20 → Permit2 approval is still outstanding, so setup runs an
  /// extra on-chain step before the signature.
  needsErc20Approve: boolean;
  /// The allowances could not be read. Setup is still offered — running it is
  /// the way out, and refusing to offer it would strand the deposit.
  unknown?: boolean;
  onRun(): void;
}

/// Standing prompt shown while a deposit is blocked on Permit2 setup. Persists
/// until the allowances cover the deposit, so dismissing the flow does not
/// strand the form behind a disabled submit button.
///
/// The underlying failure is logged rather than rendered: a viem revert runs to
/// several hundred characters of ABI and call data, which buries the one thing
/// the user can act on.
export function SetupNotice({ asset, needsErc20Approve, unknown, onRun }: SetupNoticeProps) {
  if (unknown) {
    return (
      <Notice title="Can't check token approval" actionLabel="run setup" onAction={onRun}>
        {`Couldn't read the approval status for ${asset.symbol}. Running setup will authorize it either way.`}
      </Notice>
    );
  }
  return (
    <Notice title="One-time approval needed" actionLabel="run setup" onAction={onRun}>
      {needsErc20Approve
        ? `Approve ${asset.symbol} and sign a spending window. Later deposits won't need a signature.`
        : `Sign a new spending window for ${asset.symbol} to cover this deposit.`}
    </Notice>
  );
}
