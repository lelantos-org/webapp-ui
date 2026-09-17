// The three governance writes — vote, delegate, propose — each sent from the
// connected browser wallet and followed by one invalidation of every governance
// read on the chain.

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

/// The session's EVM signer, or `undefined` for a kind that has none.
///
/// Built from the same place `buildWallet` takes it: the kind adapter's
/// `keySource`, whose `signer` is what the SDK's chain layer signs deposits
/// with. `derive` is left uncalled, so no key-derivation prompt is raised. A
/// passkey session returns no signer, which is what makes governance read-only
/// there.
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

/// Every write reports its hash as soon as the wallet has broadcast, so the
/// screen can move from "confirm in your wallet" to "waiting for the chain".
interface Sent {
  onSent?: ((hash: `0x${string}`) => void) | undefined;
}

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

/// The id of the proposal a `propose` receipt created, from its `ProposalCreated`
/// log. Only logs the governor itself emitted are read.
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
