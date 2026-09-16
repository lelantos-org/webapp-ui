// AllowanceTransfer setup: the Permit2 allowance window that lets a deposit go
// through with no per-deposit signature, granted once per token.
//
// The run itself is the SDK's `wallet.setupDepositAllowance`; what stays here is
// the terms the app grants and states to the user, and the read the form gates on.

import type { AllowanceSetupProgress, EvmAddress, WalletApi } from "@lelantos-org/sdk";
import { supportsAllowanceTransfer } from "@lelantos-org/sdk/advanced";

/// The allowance cap a setup run grants: `type(uint160).max`, the sentinel
/// Permit2 reads as unlimited, and independent of the deposit amount. Also the
/// SDK's default; passed explicitly so `evaluateSetup`'s approval check and the
/// grant cannot drift apart.
///
/// A cap sized from the current deposit re-triggers setup mid-session, since
/// `evaluateSetup` compares the window against the current total and any larger
/// deposit outruns it.
///
/// Permit2 treats `type(uint160).max` as unlimited and non-decrementing —
/// `AllowanceTransfer._transfer` guards the subtraction with
/// `if (maxAmount != type(uint160).max)` — so the window never drains and
/// `expiration` is the only bound.
///
/// `MASP.depositAuthorized` is the sole spender and reverts `PayerNotSender`
/// unless `msg.sender == d.payer`, so nothing moves without a transaction the
/// payer signed. Revisit if the pool gains a path that pulls the allowance on
/// another party's behalf.
export const ALLOWANCE_CAP = (1n << 160n) - 1n;

/// How long a granted allowance window lasts.
///
/// Exported because `SetupFlow` states this number to the user, and the disclosure
/// and the signed `expiration` must not be able to drift apart.
///
/// A quarter, not a year. With a non-draining `type(uint160).max` cap this is the
/// only thing that ends the grant, so it is the entire bound on an unlimited
/// allowance to an address the registry supplied. Shorter is strictly safer and
/// the cost is bounded: `evaluateSetup` already re-runs setup when a window
/// lapses, so the user pays one extra prompt per quarter for a grant that stops
/// standing open for a year.
export const ALLOWANCE_EXPIRY_DAYS = 90;

/// Default allowance expiry (unix seconds).
export function defaultAllowanceExpirationSecs(): number {
  return Math.floor(Date.now() / 1000) + ALLOWANCE_EXPIRY_DAYS * 24 * 3600;
}

/// Matches the SDK's `ALLOWANCE_BUFFER_SECS`, which applies the same rule.
export const SAFETY_BUFFER_SECS = 60;

/// Both allowances an AllowanceTransfer deposit depends on.
export interface Permit2AllowanceState {
  /// ERC-20 → Permit2, in token base units. Permit2 pulls through this, so a
  /// signed window has no effect without it.
  erc20Allowance: bigint;
  /// Permit2 → MASP window: the cap, its expiry, and the nonce to sign next.
  window: { amount: bigint; expiration: number; nonce: number };
}

/// Read both allowances for `token`, or `undefined` when this chain cannot
/// answer — no AllowanceTransfer support, or a registry row with no
/// `permit2Address` (the field is optional).
///
/// `undefined` rather than zeros. Zeros are a valid reading meaning nothing is
/// approved, which `evaluateSetup` treats as "setup required"; returning them
/// for a chain where setup cannot run would loop `SetupNotice` against a setup
/// that can never succeed.
///
/// Returns raw values rather than a verdict: these reads are per (payer, token)
/// while the deposit amount changes per keystroke, so the caller applies the
/// amount via `evaluateSetup`.
export async function readPermit2AllowanceState(
  wallet: WalletApi,
  token: EvmAddress,
): Promise<Permit2AllowanceState | undefined> {
  const chain = wallet.chain;
  if (!supportsAllowanceTransfer(chain) || !chain.permit2Address || !chain.tokenAllowance) {
    return undefined;
  }
  const owner = await chain.payerAddress();
  const masp = await chain.maspAddress();
  const [erc20Allowance, window] = await Promise.all([
    chain.tokenAllowance(token, owner, chain.permit2Address()),
    chain.permit2Allowance(token, owner, masp),
  ]);
  return { erc20Allowance, window };
}

/// Where a batch setup currently is: the SDK's progress events.
///
/// `approving` is the only repeating step — the ERC-20 approval is a method on
/// each token, so N tokens means N prompts — and the only variant carrying a
/// token. `signing` and `permitting` occur once per batch.
export type SetupProgress = AllowanceSetupProgress;
