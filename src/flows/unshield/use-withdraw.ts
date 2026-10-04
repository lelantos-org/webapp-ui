import type { WithdrawResult } from "@lelantos-org/sdk";
import {
  type ActionMutation,
  spendSteps,
  useSpendMutation,
  type WithdrawCall,
} from "@/features/ops";

export function useWithdraw(): ActionMutation<WithdrawCall, WithdrawResult> {
  return useSpendMutation<WithdrawCall, WithdrawResult>({
    key: "withdraw",
    label: (i) => (i.native ? "withdraw eth" : "withdraw"),
    run: (a, i, progress) => {
      progress.start(spendSteps("withdraw"));
      return a.withdraw({ ...i, onPhase: progress.set });
    },
    track: (i, result) => ({ kind: i.native ? "withdrawEth" : "withdraw", result }),
  });
}
