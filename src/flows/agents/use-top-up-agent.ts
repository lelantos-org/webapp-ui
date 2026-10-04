import type { CircuitAmount, TransferResult } from "@lelantos-org/sdk";
import { topUpAgent } from "@/features/agents";
import { type ActionMutation, useWalletTransfer } from "@/features/ops";
import type { RelayerFeeTerms } from "@/shared/domain/relayer-fee";

export interface TopUpResult {
  txHash: string;
  tx: TransferResult;
}

export interface TopUpRequest extends RelayerFeeTerms {
  address: string;
  amount: CircuitAmount;
  asset: bigint;
}

/// Sends more to an existing agent. Mints no wallet and leaves the record unchanged.
export function useTopUpAgent(): ActionMutation<TopUpRequest, TopUpResult> {
  return useWalletTransfer({
    label: "top up agent",
    failed: "topping up the agent failed",
    run: (wallet, i, ctx) => topUpAgent(wallet, { ...i, ...ctx }),
  });
}
