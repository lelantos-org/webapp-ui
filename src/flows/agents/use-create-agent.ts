import type { CircuitAmount } from "@lelantos-org/sdk";
import { createAgent, type FundAgentResult } from "@/features/agents";
import { type ActionMutation, useWalletTransfer } from "@/features/ops";
import type { RelayerFeeTerms } from "@/shared/domain/relayer-fee";

export interface CreateAgentRequest extends RelayerFeeTerms {
  label: string;
  amount: CircuitAmount;
  asset: bigint;
}

/// Funds an agent: a transfer to a newly minted ephemeral wallet.
export function useCreateAgent(): ActionMutation<CreateAgentRequest, FundAgentResult> {
  return useWalletTransfer({
    key: "fund-agent",
    label: "fund agent",
    failed: "funding the agent failed",
    // `ctx.currentChainId` rechecks the chain before spending, so the agent record
    // names the pool its notes are in.
    run: (wallet, i, ctx) => createAgent(wallet, { ...i, ...ctx }),
  });
}
