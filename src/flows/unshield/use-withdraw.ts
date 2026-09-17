import type { WithdrawResult } from "@lelantos-org/sdk";
import { type ActionMutation, useSpendMutation, type WithdrawCall } from "@/features/ops";
import { stepsFor } from "@/features/tx";

/// The unshield (withdraw) mutation.
export function useWithdraw(): ActionMutation<WithdrawCall, WithdrawResult> {
  return useSpendMutation<WithdrawCall, WithdrawResult>({
    label: (i) => (i.native ? "withdraw eth" : "withdraw"),
    run: (a, i, progress) => {
      progress.start(stepsFor("withdraw"));
      return a.withdraw({ ...i, onPhase: progress.set });
    },
    track: (i, result) => ({ kind: i.native ? "withdrawEth" : "withdraw", result }),
  });
}
