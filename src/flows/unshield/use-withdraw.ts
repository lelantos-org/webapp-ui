// The unshield (withdraw) mutation, on the note-spending policy in
// `features/ops`.

import type { WithdrawResult } from "@lelantos-org/sdk";
import { type ActionMutation, useSpendMutation, type WithdrawCall } from "@/features/ops";
import { stepsFor, type WithAsset } from "@/features/tx";

export function useWithdraw(): ActionMutation<WithdrawCall, WithAsset<WithdrawResult>> {
  return useSpendMutation<WithdrawCall, WithAsset<WithdrawResult>>({
    label: (i) => (i.asEth ? "withdraw eth" : "withdraw"),
    run: (a, i, progress) => {
      progress.start(stepsFor("withdraw"));
      // Both entry points take the same request; they differ only in the unwrap.
      const req = {
        to: i.to,
        amount: i.amount,
        asset: i.asset,
        feeAsset: i.feeAsset,
        onPhase: progress.set,
      };
      return i.asEth ? a.withdrawEth(req) : a.withdraw(req);
    },
    track: (i, result) => ({ kind: i.asEth ? "withdrawEth" : "withdraw", result }),
  });
}
