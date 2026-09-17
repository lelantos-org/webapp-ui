import { ALLOWANCE_CAP, type Permit2AllowanceState, SAFETY_BUFFER_SECS } from "./permit2-setup";

export interface SetupNeeds {
  /// ERC-20 → Permit2 allowance cannot cover the deposit.
  needsErc20Approve: boolean;
  /// A setup run would send an approval tx (allowance below the cap, not the total).
  willApproveErc20: boolean;
  /// Permit2 → MASP window is missing, too small, or about to expire.
  needsAllowancePermit: boolean;
  /// Either of the above: the deposit cannot proceed until setup runs.
  needsSetup: boolean;
}

export const NO_SETUP_NEEDS: SetupNeeds = {
  needsErc20Approve: false,
  willApproveErc20: false,
  needsAllowancePermit: false,
  needsSetup: false,
};

/// What must be authorized before depositing `total`, fees included; anything less fails on-chain.
/// Without `total` it checks existence only; an `undefined` status (chain cannot answer) needs nothing.
export function evaluateSetup(
  status: Permit2AllowanceState | undefined,
  total: bigint | undefined,
  nowSecs: number = Math.floor(Date.now() / 1000),
): SetupNeeds {
  if (!status) return NO_SETUP_NEEDS;
  const target = total ?? 1n;
  const needsErc20Approve = status.erc20Allowance < target;
  const windowCovers =
    status.window.amount >= target && status.window.expiration > nowSecs + SAFETY_BUFFER_SECS;
  const needsAllowancePermit = !windowCovers;
  return {
    needsErc20Approve,
    willApproveErc20: status.erc20Allowance < ALLOWANCE_CAP,
    needsAllowancePermit,
    needsSetup: needsErc20Approve || needsAllowancePermit,
  };
}

/// One distinct token a deposit pulls: its allowances and the summed amount to cover.
export interface SetupTarget {
  status: Permit2AllowanceState | undefined;
  total: bigint | undefined;
}

/// `evaluateSetup` per pulled token, and the deposit's verdict: outstanding while any token's is.
export function evaluateDepositSetup(
  targets: readonly SetupTarget[],
  nowSecs: number = Math.floor(Date.now() / 1000),
): { needs: SetupNeeds; perToken: SetupNeeds[] } {
  const perToken = targets.map((t) => evaluateSetup(t.status, t.total, nowSecs));
  const any = (k: keyof SetupNeeds) => perToken.some((n) => n[k]);
  return {
    needs: {
      needsErc20Approve: any("needsErc20Approve"),
      willApproveErc20: any("willApproveErc20"),
      needsAllowancePermit: any("needsAllowancePermit"),
      needsSetup: any("needsSetup"),
    },
    perToken,
  };
}
