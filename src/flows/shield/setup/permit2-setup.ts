import type { AllowanceSetupProgress, EvmAddress, WalletApi } from "@lelantos-org/sdk";
import { supportsAllowanceTransfer } from "@lelantos-org/sdk/advanced";

/// Allowance cap a setup run grants: `type(uint160).max`, which Permit2 treats as unlimited.
/// Safe only while `MASP.depositAuthorized` (sole spender) requires `msg.sender == payer`.
export const ALLOWANCE_CAP = (1n << 160n) - 1n;

/// Lifetime of a granted allowance window: the only bound on the unlimited cap.
export const ALLOWANCE_EXPIRY_DAYS = 90;

/// Default allowance expiry (unix seconds).
export function defaultAllowanceExpirationSecs(): number {
  return Math.floor(Date.now() / 1000) + ALLOWANCE_EXPIRY_DAYS * 24 * 3600;
}

/// Matches the SDK's `ALLOWANCE_BUFFER_SECS`, which applies the same rule.
export const SAFETY_BUFFER_SECS = 60;

/// Both allowances an AllowanceTransfer deposit depends on.
export interface Permit2AllowanceState {
  /// ERC-20 → Permit2, in token base units.
  erc20Allowance: bigint;
  /// Permit2 → MASP window: the cap, its expiry, and the nonce to sign next.
  window: { amount: bigint; expiration: number; nonce: number };
}

/// Read both allowances for `token`, or `undefined` (not zeros) when this chain cannot answer.
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

/// Where a batch setup currently is; `approving` repeats once per token.
export type SetupProgress = AllowanceSetupProgress;
