// The swap mutation, on the note-spending policy in `features/ops`.

import type { SwapResult } from "@lelantos-org/sdk";
import { type ActionMutation, type SwapCall, useSpendMutation } from "@/features/ops";
import { stepsFor } from "@/features/tx";

export function useSwap(): ActionMutation<SwapCall, SwapResult> {
  return useSpendMutation<SwapCall, SwapResult>({
    label: () => "swap",
    run: (a, i, progress) => {
      progress.start(stepsFor("swap"));
      return a.swap({ ...i, onPhase: progress.set });
    },
    track: (i, result) => ({ kind: "swap", result, swap: i }),
  });
}
