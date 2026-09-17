import type { DepositResult } from "@lelantos-org/sdk";
import { useInvalidateTransparentBalances } from "@/features/assets";
import { type ActionMutation, type DepositCall, useTrackedMutation } from "@/features/ops";
import { stepsFor } from "@/features/tx";
import { useWalletInstance } from "@/features/wallet";
import { approvePermit2, needsPermit2Approval } from "./setup/permit2-approval";

/// The shield (deposit) mutation.
export function useDeposit(): ActionMutation<DepositCall, DepositResult> {
  const wallet = useWalletInstance();
  const invalidateTransparent = useInvalidateTransparentBalances();
  return useTrackedMutation<DepositCall, DepositResult>({
    label: () => "deposit",
    run: async (a, i, progress) => {
      if (!wallet) throw new Error("wallet not ready");
      // Quote at submit, not from cached form figures: witness path approves every pulled token.
      const call = {
        amount: i.amount,
        asset: i.asset,
        native: i.native,
        ...(!i.native && i.feeAsset !== undefined ? { feeAsset: i.feeAsset } : {}),
      };
      const quote = await wallet.quoteDeposit(call);
      if (quote.strategy === "native") {
        progress.start(stepsFor("deposit", { asEth: true }));
      } else if (quote.strategy === "allowance") {
        progress.start(stepsFor("deposit", { allowanceTransfer: true, needsApproval: false }));
      } else {
        const needed = await Promise.all(quote.pulls.map((p) => needsPermit2Approval(wallet, p)));
        const short = quote.pulls.filter((_, k) => needed[k]).map((p) => p.token);
        progress.start(
          stepsFor("deposit", { allowanceTransfer: false, needsApproval: short.length > 0 }),
        );
        if (short.length > 0) progress.set("approving");
        // Sequential: parallel approvals race the nonce.
        for (const token of short) await approvePermit2(wallet, token);
      }
      return a.deposit({ ...call, onPhase: progress.set });
    },
    track: (_i, result) => ({ kind: "deposit", result }),
    onSuccess: () => void invalidateTransparent(),
  });
}
