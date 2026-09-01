import type { RegisteredAsset } from "@/features/assets";
import { Notice } from "@/shared/ui/Notice";

export interface SetupNoticeProps {
  asset: RegisteredAsset;
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
/// The underlying failure is logged rather than rendered: a viem revert runs to
/// several hundred characters of ABI and call data, obscuring the actionable
/// part.
export function SetupNotice({ asset, willApproveErc20, unknown, onRun }: SetupNoticeProps) {
  if (unknown) {
    return (
      <Notice title="Can't check token approval" actionLabel="run setup" onAction={onRun}>
        {`Couldn't read the approval status for ${asset.symbol}. Running setup will authorize it either way.`}
      </Notice>
    );
  }
  return (
    <Notice title="One-time approval needed" actionLabel="run setup" onAction={onRun}>
      {willApproveErc20
        ? `Approve ${asset.symbol} and sign a spending window. Later deposits won't need a signature.`
        : `Sign a new spending window for ${asset.symbol} to cover this deposit.`}
    </Notice>
  );
}
