// What a Permit2 AllowanceTransfer deposit still needs authorized, decided from
// the allowances `readPermit2AllowanceState` read. Pure, so the rules are
// testable without the probe hooks behind them.
//
// Per token: a deposit paying its relayer in another token pulls from two, and
// each pull is authorized separately — `(owner, token, spender)` keys both the
// ERC-20 approval and the Permit2 window.

import { ALLOWANCE_CAP, type Permit2AllowanceState, SAFETY_BUFFER_SECS } from "./permit2-setup";

export interface SetupNeeds {
  /// ERC-20 → Permit2 allowance cannot cover the deposit.
  needsErc20Approve: boolean;
  /// Whether a setup run would actually send an approval tx for this asset.
  ///
  /// Distinct from `needsErc20Approve`, which gates the deposit and so compares
  /// against the total. `setupDepositAllowance` compares against the
  /// cap it is about to grant, so an allowance covering this deposit but sitting
  /// below the cap is approved anyway. Predicting it with the gating comparison
  /// leaves the stepper without a row for a prompt the wallet does show, and the
  /// cost line one step short.
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

/// Decide what the user must authorize before depositing `total` (amount plus
/// the protocol and relayer fees, in token base units).
///
/// Both allowances are compared against the real total, matching the SDK's
/// `pickDepositStrategy`: it takes the AllowanceTransfer path only when the
/// window covers `total`, otherwise falling back to the per-deposit witness
/// path, which needs an ERC-20 allowance of its own. A check against any lower
/// threshold passes here and then fails on-chain.
///
/// Before an amount is typed there is no total to compare against, but a token
/// with nothing approved still needs setup, since zero covers no amount. The
/// probe then acts as an existence check and tightens to the exact total once
/// the fee preview resolves.
///
/// An `undefined` status means the probe could not answer — this chain has no
/// Permit2 to authorize against — so there is nothing for setup to do. An
/// all-zero reading would instead mean nothing is approved yet, putting the
/// deposit behind a setup flow that cannot succeed.
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
    // The cap the run grants, matching `setupDepositAllowance`'s own
    // allowance-below-cap filter.
    willApproveErc20: status.erc20Allowance < ALLOWANCE_CAP,
    needsAllowancePermit,
    needsSetup: needsErc20Approve || needsAllowancePermit,
  };
}

/// One token a deposit pulls: the allowances read for it and what it must cover,
/// in its own base units. A token pulled twice — a plain id and a yield id over
/// it — arrives here once, with the sum.
export interface SetupTarget {
  status: Permit2AllowanceState | undefined;
  total: bigint | undefined;
}

/// `evaluateSetup` over every token a deposit pulls, and the verdict for the
/// deposit as a whole: setup is outstanding while any token's is.
///
/// All of them, as the SDK's `pickDepositStrategy` requires: a window covering
/// the principal does not pay a relayer note in another token, and that deposit
/// falls back to the witness path the setup gate exists to avoid.
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
