// The send (shielded transfer) mutation, on the note-spending policy in
// `features/ops`.

import type { TransferResult } from "@lelantos-org/sdk";
import { type ActionMutation, type TransferCall, useSpendMutation } from "@/features/ops";
import { stepsFor, type WithAsset } from "@/features/tx";
import { useWalletInstance } from "@/features/wallet";

export function useTransfer(): ActionMutation<TransferCall, WithAsset<TransferResult>> {
  const wallet = useWalletInstance();
  return useSpendMutation<TransferCall, WithAsset<TransferResult>>({
    label: () => "transfer",
    run: (a, i, progress) => {
      progress.start(stepsFor("transfer"));
      return a.transfer({
        to: i.to,
        amount: i.amount,
        asset: i.asset,
        feeAsset: i.feeAsset,
        onPhase: progress.set,
      });
    },
    track: (i, result) => ({
      kind: "transfer",
      result,
      isSelfTransfer: !!wallet && i.to === wallet.address,
    }),
  });
}
