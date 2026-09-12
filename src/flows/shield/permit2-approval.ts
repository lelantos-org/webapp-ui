// The ERC-20 → Permit2 approval a witness-path deposit may need first.
//
// Helpers around the SDK's optional Permit2 chain methods. Predicate and action
// are split so a caller can decide whether to render an "approving" step before
// starting the transaction. The AllowanceTransfer setup that makes per-deposit
// signatures unnecessary is `setup/permit2-setup.ts`.

import { type EvmAddress, supportsDeposit, tokenAmount, type WalletApi } from "@lelantos-org/sdk";

/// `type(uint256).max`: an ERC-20 approval Permit2 never has to ask for again.
export const MAX_UINT256 = tokenAmount((1n << 256n) - 1n);

/// True when the payer's allowance for `token` to Permit2 is below `total`.
/// False when the chain adapter lacks Permit2 helpers (non-EVM), where no
/// approval step applies.
export async function needsPermit2Approval(
  wallet: WalletApi,
  token: EvmAddress,
  total: bigint,
): Promise<boolean> {
  // `supportsDeposit` first: without a signing key there is no owner to hold
  // an allowance and no way to grant one, so no approval step applies.
  if (!supportsDeposit(wallet)) return false;
  const chain = wallet.chain;
  if (!chain.tokenAllowance || !chain.tokenApprove || !chain.permit2Address) return false;
  const owner = await chain.payerAddress();
  const cur = await chain.tokenAllowance(token, owner, chain.permit2Address());
  return cur < total;
}

/// Send a `tokenApprove(MAX)` tx for `token` against Permit2. Callers must first
/// confirm the approval is needed via `needsPermit2Approval`.
export async function approvePermit2(wallet: WalletApi, token: EvmAddress): Promise<void> {
  if (!supportsDeposit(wallet)) {
    throw new Error("approvePermit2: this wallet holds no EVM key to approve with");
  }
  const chain = wallet.chain;
  if (!chain.tokenApprove || !chain.permit2Address) {
    throw new Error("approvePermit2: chain adapter does not support Permit2");
  }
  await chain.tokenApprove(token, chain.permit2Address(), MAX_UINT256);
}
