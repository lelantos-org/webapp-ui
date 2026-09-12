// The swap mutation, on the note-spending policy in `features/ops`.

import type { SwapResult } from "@lelantos-org/sdk";
import { type ActionMutation, type SwapCall, useSpendMutation } from "@/features/ops";
import { stepsFor, type WithAsset } from "@/features/tx";

export function useSwap(): ActionMutation<SwapCall, WithAsset<SwapResult>> {
  return useSpendMutation<SwapCall, WithAsset<SwapResult>>({
    label: () => "swap",
    run: (a, i, progress) => {
      progress.start(stepsFor("swap"));
      return a.swap({
        assetIn: i.assetIn,
        assetOut: i.assetOut,
        amount: i.amount,
        quote: i.quote,
        feeAsset: i.feeAsset,
        onPhase: progress.set,
      });
    },
    track: (i, result) => ({ kind: "swap", result, swap: i }),
  });
}
