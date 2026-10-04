import type { TransferResult } from "@lelantos-org/sdk";
import {
  type ActionMutation,
  spendSteps,
  type TransferCall,
  useSpendMutation,
} from "@/features/ops";
import { useWalletInstance } from "@/features/wallet";

export function useTransfer(): ActionMutation<TransferCall, TransferResult> {
  const wallet = useWalletInstance();
  return useSpendMutation<TransferCall, TransferResult>({
    key: "transfer",
    label: () => "transfer",
    run: (a, i, progress) => {
      progress.start(spendSteps("transfer"));
      return a.transfer({ ...i, onPhase: progress.set });
    },
    track: (i, result) => ({
      kind: "transfer",
      result,
      isSelfTransfer: !!wallet && i.recipient === wallet.address,
    }),
  });
}
