import { type DepositPull, type EvmAddress, tokenAmount, type WalletApi } from "@lelantos-org/sdk";
import { supportsSigning } from "@lelantos-org/sdk/advanced";

const MAX_UINT256 = tokenAmount((1n << 256n) - 1n);

/// True when the payer's ERC-20 allowance to Permit2 is below what the pool pulls.
export async function needsPermit2Approval(wallet: WalletApi, pull: DepositPull): Promise<boolean> {
  if (pull.allowance) return pull.allowance.erc20 < pull.amount;
  const chain = wallet.chain;
  if (!supportsSigning(chain)) return false;
  if (!chain.tokenAllowance || !chain.tokenApprove || !chain.permit2Address) return false;
  const owner = await chain.payerAddress();
  const cur = await chain.tokenAllowance(pull.token, owner, chain.permit2Address());
  return cur < pull.amount;
}

/// Send a max ERC-20 approval of `token` to Permit2; check `needsPermit2Approval` first.
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
