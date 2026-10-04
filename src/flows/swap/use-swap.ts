import type { SwapResult } from "@lelantos-org/sdk";
import { type ActionMutation, type SwapCall, spendSteps, useSpendMutation } from "@/features/ops";

export function useSwap(): ActionMutation<SwapCall, SwapResult> {
  return useSpendMutation<SwapCall, SwapResult>({
    key: "swap",
    label: () => "swap",
    run: (a, i, progress) => {
      progress.start(spendSteps("swap"));
      return a.swap({ ...i, onPhase: progress.set });
    },
    track: (i, result) => ({ kind: "swap", result, swap: i }),
  });
}
