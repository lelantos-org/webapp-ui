// Helpers around the SDK's optional Permit2 chain methods. Predicate and
// action are split so callers can pre-decide whether to render an
// "approving" step before kicking off the tx.

import { supportsAllowanceTransfer, type WalletApi } from "@lelantos-org/sdk";

const MAX_UINT256 = (1n << 256n) - 1n;

/// True when payer's allowance for `token` to Permit2 is below `total`;
/// false when the chain adapter lacks Permit2 helpers (non-EVM), meaning
/// no approval step is needed.
export async function needsPermit2Approval(
  wallet: WalletApi,
  token: string,
  total: bigint,
): Promise<boolean> {
  const chain = wallet.chain;
  if (!chain.tokenAllowance || !chain.tokenApprove || !chain.permit2Address) return false;
  const owner = await chain.payerAddress();
  const cur = await chain.tokenAllowance(token, owner, chain.permit2Address());
  return cur < total;
}

/// Send a `tokenApprove(MAX)` tx for `token` against Permit2. Caller must
/// have confirmed the approval is needed via `needsPermit2Approval`.
export async function approvePermit2(wallet: WalletApi, token: string): Promise<void> {
  const chain = wallet.chain;
  if (!chain.tokenApprove || !chain.permit2Address) {
    throw new Error("approvePermit2: chain adapter does not support Permit2");
  }
  await chain.tokenApprove(token, chain.permit2Address(), MAX_UINT256);
}

/// Approve Permit2 only if the current allowance does not cover `total`.
export async function ensurePermit2Allowance(
  wallet: WalletApi,
  token: string,
  total: bigint,
): Promise<void> {
  if (await needsPermit2Approval(wallet, token, total)) {
    await approvePermit2(wallet, token);
  }
}

// ============================================================================
// AllowanceTransfer helpers — no per-deposit Permit2 signature needed.
// ============================================================================

/// Default allowance cap heuristic; callers can override.
export function defaultAllowanceCap(depositTotal: bigint): bigint {
  return depositTotal * 10n;
}

/// Default allowance expiry (unix-seconds).
export function defaultAllowanceExpirationSecs(): number {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
}

const SAFETY_BUFFER_SECS = 60;

/// Returns what (if anything) the user must authorize before a deposit of
/// `total` can flow through `submitIntentAuthorized`.
export async function needsPermit2AllowanceRenewal(
  wallet: WalletApi,
  token: string,
  total: bigint,
): Promise<{
  needsErc20Approve: boolean;
  needsAllowancePermit: boolean;
  /// Allowance read reused from the predicate; callers can render status
  /// without re-reading.
  current: { amount: bigint; expiration: number; nonce: number };
}> {
  const chain = wallet.chain;
  if (!supportsAllowanceTransfer(chain) || !chain.permit2Address || !chain.tokenAllowance) {
    return {
      needsErc20Approve: false,
      needsAllowancePermit: false,
      current: { amount: 0n, expiration: 0, nonce: 0 },
    };
  }
  const owner = await chain.payerAddress();
  const masp = await chain.maspAddress();
  const [erc20Allow, p2Allow] = await Promise.all([
    chain.tokenAllowance(token, owner, chain.permit2Address()),
    chain.permit2Allowance(token, owner, masp),
  ]);
  const nowSec = Math.floor(Date.now() / 1000);
  const allowanceCovers =
    p2Allow.amount >= total && p2Allow.expiration > nowSec + SAFETY_BUFFER_SECS;
  return {
    needsErc20Approve: erc20Allow < total,
    needsAllowancePermit: !allowanceCovers,
    current: p2Allow,
  };
}

export type SetupStep = "approving" | "signing" | "permitting";
export type SetupStatus = "wallet" | "confirming";

/// One-time-per-window setup allowing future deposits to pull via
/// `submitIntentAuthorized` with no per-tx Permit2 sig. `onProgress` fires
/// `wallet` before each sub-step (waiting on the wallet popup), then
/// `confirming` with the broadcast tx hash for the two on-chain steps.
export async function ensurePermit2AuthorizedSetup(
  wallet: WalletApi,
  token: string,
  cap: bigint,
  expirationUnixSecs: number,
  onProgress?: (step: SetupStep, status: SetupStatus, txHash?: string) => void,
): Promise<void> {
  const chain = wallet.chain;
  if (
    !supportsAllowanceTransfer(chain) ||
    !chain.permit2Address ||
    !chain.tokenApprove ||
    !chain.tokenAllowance
  ) {
    throw new Error(
      "ensurePermit2AuthorizedSetup: chain adapter lacks Permit2 AllowanceTransfer methods",
    );
  }
  const owner = await chain.payerAddress();
  const masp = await chain.maspAddress();
  const erc20Allow = await chain.tokenAllowance(token, owner, chain.permit2Address());
  if (erc20Allow < cap) {
    onProgress?.("approving", "wallet");
    await chain.tokenApprove(token, chain.permit2Address(), MAX_UINT256, (hash) => {
      onProgress?.("approving", "confirming", hash);
    });
  }
  const cur = await chain.permit2Allowance(token, owner, masp);
  const sigDeadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
  const permit = {
    details: {
      token,
      amount: cap,
      expiration: expirationUnixSecs,
      nonce: cur.nonce,
    },
    spender: masp,
    sigDeadline,
  };
  onProgress?.("signing", "wallet");
  const { signature } = await chain.signPermit2Allowance(permit);
  onProgress?.("permitting", "wallet");
  await chain.permit2PermitAllowance({ owner, permit, signature }, (hash) => {
    onProgress?.("permitting", "confirming", hash);
  });
}
