// Helpers around the SDK's optional Permit2 chain methods. Predicate and
// action are split so callers can pre-decide whether to render an
// "approving" step before kicking off the tx.

import {
  type EvmAddress,
  supportsAllowanceTransfer,
  tokenAmount,
  type WalletApi,
} from "@lelantos-org/sdk";

const MAX_UINT256 = tokenAmount((1n << 256n) - 1n);

/// True when payer's allowance for `token` to Permit2 is below `total`;
/// false when the chain adapter lacks Permit2 helpers (non-EVM), meaning
/// no approval step is needed.
export async function needsPermit2Approval(
  wallet: WalletApi,
  token: EvmAddress,
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
export async function approvePermit2(wallet: WalletApi, token: EvmAddress): Promise<void> {
  const chain = wallet.chain;
  if (!chain.tokenApprove || !chain.permit2Address) {
    throw new Error("approvePermit2: chain adapter does not support Permit2");
  }
  await chain.tokenApprove(token, chain.permit2Address(), MAX_UINT256);
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

/// Matches `ALLOWANCE_BUFFER_SECS` in the SDK, which decides the same way.
export const SAFETY_BUFFER_SECS = 60;

/// Both allowances an AllowanceTransfer deposit depends on.
export interface Permit2AllowanceState {
  /// ERC-20 → Permit2, in token base units. Permit2 pulls through this, so a
  /// signed window is worthless without it.
  erc20Allowance: bigint;
  /// Permit2 → MASP window: the cap, its expiry, and the nonce to sign next.
  window: { amount: bigint; expiration: number; nonce: number };
}

/// Read both allowances for `token`. Zeroed when the adapter has no
/// AllowanceTransfer support, which reads as "setup cannot help here".
///
/// Deliberately returns raw values rather than a verdict: the amount being
/// deposited changes per keystroke, while these reads are per (payer, token),
/// so the caller applies the amount via `evaluateSetup`.
export async function readPermit2AllowanceState(
  wallet: WalletApi,
  token: EvmAddress,
): Promise<Permit2AllowanceState> {
  const chain = wallet.chain;
  if (!supportsAllowanceTransfer(chain) || !chain.permit2Address || !chain.tokenAllowance) {
    return { erc20Allowance: 0n, window: { amount: 0n, expiration: 0, nonce: 0 } };
  }
  const owner = await chain.payerAddress();
  const masp = await chain.maspAddress();
  const [erc20Allowance, window] = await Promise.all([
    chain.tokenAllowance(token, owner, chain.permit2Address()),
    chain.permit2Allowance(token, owner, masp),
  ]);
  return { erc20Allowance, window };
}

export type SetupStep = "approving" | "signing" | "permitting";
/// Where a `SetupStep` currently is: awaiting the wallet prompt, or waiting
/// on the chain. Distinct from `onboarding/use-setup-status`'s `SetupStepPhase`,
/// which is the allowance probe result — hence the narrower name.
export type SetupStepPhase = "wallet" | "confirming";

/// One-time-per-window setup allowing future deposits to pull via
/// `submitDepositAuthorized` with no per-tx Permit2 sig. `onProgress` fires
/// `wallet` before each sub-step (waiting on the wallet popup), then
/// `confirming` with the broadcast tx hash for the two on-chain steps.
export async function ensurePermit2AuthorizedSetup(
  wallet: WalletApi,
  token: EvmAddress,
  cap: bigint,
  expirationUnixSecs: number,
  onProgress?: (step: SetupStep, status: SetupStepPhase, txHash?: string) => void,
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
