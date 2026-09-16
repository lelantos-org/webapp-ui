// The ERC-20 → Permit2 approval a witness-path deposit may need first.
//
// `wallet.quoteDeposit` states each pull's approval where the adapter can read
// Permit2 state; these cover the one step the SDK does not send itself — the
// approval ahead of a per-deposit witness signature. The AllowanceTransfer setup
// that makes per-deposit signatures unnecessary is `permit2-setup.ts`.

import { type DepositPull, type EvmAddress, tokenAmount, type WalletApi } from "@lelantos-org/sdk";
import { supportsSigning } from "@lelantos-org/sdk/advanced";

/// `type(uint256).max`: an ERC-20 approval Permit2 never has to ask for again.
const MAX_UINT256 = tokenAmount((1n << 256n) - 1n);

/// True when the payer's allowance for `pull.token` to Permit2 is below what the
/// pool pulls. Read from the quote where it carries the allowance; otherwise from
/// the chain, and false when the adapter has no Permit2 helpers, where no
/// approval step applies.
export async function needsPermit2Approval(wallet: WalletApi, pull: DepositPull): Promise<boolean> {
  // Permit2 transfers only what the pool asks for, so that — not the signed
  // ceiling — is what the ERC-20 allowance must cover.
  if (pull.allowance) return pull.allowance.erc20 < pull.amount;
  const chain = wallet.chain;
  // Without a signing key there is no owner to hold an allowance and no way to
  // grant one, so no approval step applies.
  if (!supportsSigning(chain)) return false;
  if (!chain.tokenAllowance || !chain.tokenApprove || !chain.permit2Address) return false;
  const owner = await chain.payerAddress();
  const cur = await chain.tokenAllowance(pull.token, owner, chain.permit2Address());
  return cur < pull.amount;
}

/// Send a `tokenApprove(MAX)` tx for `token` against Permit2. Callers must first
/// confirm the approval is needed via `needsPermit2Approval`.
export async function approvePermit2(wallet: WalletApi, token: EvmAddress): Promise<void> {
  const chain = wallet.chain;
  if (!supportsSigning(chain)) {
    throw new Error("approvePermit2: this wallet holds no EVM key to approve with");
  }
  if (!chain.tokenApprove || !chain.permit2Address) {
    throw new Error("approvePermit2: chain adapter does not support Permit2");
  }
  await chain.tokenApprove(token, chain.permit2Address(), MAX_UINT256);
}
