// The shield (deposit) mutation. The policy it shares with the other ops —
// the stepper, the failure toast and post-submit tracking — is
// `useTrackedMutation` in `features/ops`.

import { type DepositResult, supportsAllowanceTransfer, type WalletApi } from "@lelantos-org/sdk";
import { useInvalidateTransparentBalances } from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import { fetchAssetFeeInputs } from "@/features/fees";
import { type ActionMutation, type DepositCall, useTrackedMutation } from "@/features/ops";
import { preopenDepositStream, stepsFor, type WithAsset } from "@/features/tx";
import { useWalletInstance } from "@/features/wallet";
import { feeBreakdown } from "@/shared/domain/fee-math";
import { approvePermit2, needsPermit2Approval } from "./permit2-approval";

export function useDeposit(): ActionMutation<DepositCall> {
  const wallet = useWalletInstance();
  const chain = useActiveChain();
  const invalidateTransparent = useInvalidateTransparentBalances();
  return useTrackedMutation<DepositCall, WithAsset<DepositResult>>({
    label: () => "deposit",
    run: async (a, i, progress) => {
      if (!wallet) throw new Error("wallet not ready");
      const w = wallet as WalletApi;

      // Subscribe to the relayer SSE before sending the tx. The broadcast
      // channel delivers only events emitted after a receiver is attached, so on
      // fast chains the Flushed event can land before `trackTxLifecycle`
      // subscribes and stall the stepper on "pending deposit".
      preopenDepositStream(chain.chainId);

      // Native ETH path: a single payable tx — the contract wraps internally, so
      // no approval and no Permit2 signature. AllowanceTransfer mode needs no
      // per-deposit signature either: the SetupFlow modal in DepositForm gates
      // the form on a missing or expired allowance, so the window is expected to
      // cover the pull. The witness path, for adapters without that entry point,
      // signs per deposit and bundles a first-time ERC-20 max-approve into the
      // stepper.
      if (i.asEth) {
        progress.start(stepsFor("deposit", { asEth: true }));
      } else {
        // The deposit leg: this sizes the Permit2 window, and the pool pulls the
        // principal plus that leg's fee.
        const { scale, feeBps, token, index } = await fetchAssetFeeInputs(w, i.asset, "deposit");
        const { total } = feeBreakdown({ amount: i.amount, scale, feeBps, leg: "deposit", index });
        const allowanceTransfer = supportsAllowanceTransfer(w.chain);
        const needsApproval = !allowanceTransfer && (await needsPermit2Approval(w, token, total));
        progress.start(stepsFor("deposit", { allowanceTransfer, needsApproval }));
        if (needsApproval) {
          progress.set("approving");
          await approvePermit2(w, token);
        }
      }
      return a.deposit({
        amount: i.amount,
        asset: i.asset,
        ...(i.asEth ? { asEth: true } : {}),
        onPhase: progress.set,
      });
    },
    track: (_i, result) => ({ kind: "deposit", result }),
    // The funds have left the transparent balance the form validates against,
    // and that query holds its value for `BALANCE_STALE_MS`.
    onSuccess: () => void invalidateTransparent(),
  });
}
