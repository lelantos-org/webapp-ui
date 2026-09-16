// The shield (deposit) mutation. The policy it shares with the other ops —
// the stepper, the failure toast and post-submit tracking — is
// `useTrackedMutation` in `features/ops`.

import type { DepositResult } from "@lelantos-org/sdk";
import { useInvalidateTransparentBalances } from "@/features/assets";
import { type ActionMutation, type DepositCall, useTrackedMutation } from "@/features/ops";
import { stepsFor } from "@/features/tx";
import { useWalletInstance } from "@/features/wallet";
import { approvePermit2, needsPermit2Approval } from "./setup/permit2-approval";

export function useDeposit(): ActionMutation<DepositCall, DepositResult> {
  const wallet = useWalletInstance();
  const invalidateTransparent = useInvalidateTransparentBalances();
  return useTrackedMutation<DepositCall, DepositResult>({
    label: () => "deposit",
    run: async (a, i, progress) => {
      if (!wallet) throw new Error("wallet not ready");

      // The path the deposit will take, and what it pulls of each token, as the
      // SDK prices and chooses them now — read at submit rather than from the
      // form's cached figures. It rejects as the deposit would (a refused or
      // unquoted fee asset) before any prompt.
      //
      // Native coin is a single payable tx — the contract wraps internally, so
      // no approval and no Permit2 signature. The AllowanceTransfer path needs no
      // per-deposit signature either: the SetupFlow modal in DepositForm gates the
      // form on a missing or expired allowance, so the window covers the pull.
      // The witness path signs per deposit and bundles a first-time ERC-20
      // max-approve into the stepper — one per token the deposit pulls, since a
      // relayer fee paid in another token is pulled through that token's own
      // allowance.
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
        // Sequential: wallets serialise prompts, and firing both races the nonce.
        for (const token of short) await approvePermit2(wallet, token);
      }
      return a.deposit({ ...call, onPhase: progress.set });
    },
    track: (_i, result) => ({ kind: "deposit", result }),
    // The funds have left the transparent balance the form validates against,
    // and that query holds its value for `BALANCE_STALE_MS`.
    onSuccess: () => void invalidateTransparent(),
  });
}
