// The send (shielded transfer) mutation, on the note-spending policy in
// `features/ops`.

import type { TransferResult } from "@lelantos-org/sdk";
import { type ActionMutation, type TransferCall, useSpendMutation } from "@/features/ops";
import { stepsFor } from "@/features/tx";
import { useWalletInstance } from "@/features/wallet";

export function useTransfer(): ActionMutation<TransferCall, TransferResult> {
  const wallet = useWalletInstance();
  return useSpendMutation<TransferCall, TransferResult>({
    label: () => "transfer",
    run: (a, i, progress) => {
      progress.start(stepsFor("transfer"));
      return a.transfer({ ...i, onPhase: progress.set });
    },
    track: (i, result) => ({
      kind: "transfer",
      result,
      isSelfTransfer: !!wallet && i.recipient === wallet.address,
    }),
  });
}
