import type { EthSigner, EvmAddress } from "@lelantos-org/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { decodeEventLog, encodeFunctionData, type TransactionReceipt } from "viem";
import { useActiveChainOrUndefined } from "@/features/chain";
import { useSession } from "@/features/wallet";
import { kindAdapter } from "@/features/wallet-kinds";
import { queryKeys } from "@/shared/query/keys";
import { governorAbi, govTokenAbi } from "./abi";
import type { BuiltAction } from "./actions";
import type { VoteSupport } from "./client";
import { governanceClient } from "./onchain";
import { useGovernance } from "./queries";
import { type GovTxDeps, sendGovernanceTx } from "./tx";

/// The session's EVM signer without prompting key derivation, or `undefined` (e.g. passkey sessions).
export function useGovernanceSigner(): EthSigner | undefined {
  const { kind, layer } = useSession();
  const chain = useActiveChainOrUndefined();
  return useMemo(
    () => (kind && layer && chain ? kindAdapter(kind).keySource(layer, chain).signer : undefined),
    [kind, layer, chain],
  );
}

/// Thrown when a write is attempted with no signer or account.
export class NoGovernanceSigner extends Error {
  constructor() {
    super("this wallet cannot send transactions");
    this.name = "NoGovernanceSigner";
  }
}

function useTxDeps(): () => GovTxDeps & { governor: EvmAddress } {
  const { chain, governor, account } = useGovernance();
  const signer = useGovernanceSigner();
  return () => {
    if (!signer || !account || !governor) throw new NoGovernanceSigner();
    return { signer, account, governor, client: governanceClient(chain) };
  };
}

function useInvalidateGovernance(): () => Promise<void> {
  const qc = useQueryClient();
  const { chain } = useGovernance();
  return () => qc.invalidateQueries({ queryKey: queryKeys.governance(chain.chainId) });
}

interface Sent {
  onSent?: ((hash: `0x${string}`) => void) | undefined;
}

/// Inputs to `useCastVote`.
export interface CastVoteInput extends Sent {
  support: VoteSupport;
  reason: string;
}

/// `castVoteWithReason` on one proposal. An empty reason is sent as-is.
export function useCastVote(proposalId: string) {
  const deps = useTxDeps();
  const invalidate = useInvalidateGovernance();
  return useMutation({
    mutationFn: ({ support, reason, onSent }: CastVoteInput) => {
      const d = deps();
      return sendGovernanceTx(d, {
        onSent,
        to: d.governor,
        data: encodeFunctionData({
          abi: governorAbi,
          functionName: "castVoteWithReason",
          args: [BigInt(proposalId), support, reason],
        }),
      });
    },
    onSettled: invalidate,
  });
}

/// Inputs to `useDelegate`.
export interface DelegateInput extends Sent {
  token: EvmAddress;
  delegatee: EvmAddress;
}

/// `delegate(delegatee)` on the voting token.
export function useDelegate() {
  const deps = useTxDeps();
  const invalidate = useInvalidateGovernance();
  return useMutation({
    mutationFn: ({ token, delegatee, onSent }: DelegateInput) =>
      sendGovernanceTx(deps(), {
        onSent,
        to: token,
        data: encodeFunctionData({ abi: govTokenAbi, functionName: "delegate", args: [delegatee] }),
      }),
    onSettled: invalidate,
  });
}

/// The new proposal id from a `propose` receipt's `ProposalCreated` log, emitted by `governor` only.
export function createdProposalId(
  receipt: Pick<TransactionReceipt, "logs">,
  governor: EvmAddress,
): string | undefined {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== governor.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: governorAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "ProposalCreated") return ev.args.proposalId.toString();
    } catch {
      // Another event.
    }
  }
  return undefined;
}

/// Inputs to `usePropose`.
export interface ProposeInput extends Sent {
  actions: readonly BuiltAction[];
  description: string;
}

/// `propose(targets, values, calldatas, description)`; resolves with the new id.
export function usePropose() {
  const deps = useTxDeps();
  const invalidate = useInvalidateGovernance();
  return useMutation({
    mutationFn: async ({ actions, description, onSent }: ProposeInput) => {
      const d = deps();
      const receipt = await sendGovernanceTx(d, {
        onSent,
        to: d.governor,
        data: encodeFunctionData({
          abi: governorAbi,
          functionName: "propose",
          args: [
            actions.map((a) => a.target),
            actions.map((a) => a.value),
            actions.map((a) => a.calldata),
            description,
          ],
        }),
      });
      return { receipt, proposalId: createdProposalId(receipt, d.governor) };
    },
    onSettled: invalidate,
  });
}
