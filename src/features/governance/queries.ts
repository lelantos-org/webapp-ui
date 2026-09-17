import type { EvmAddress } from "@lelantos-org/sdk";
import { evmAddress } from "@lelantos-org/sdk";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ChainEntry } from "@/config/chains";
import { env } from "@/config/env";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";
import { GOVERNANCE_POLL_MS, usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";
import {
  fetchProposal,
  fetchProposals,
  fetchVotes,
  isProposalId,
  type ProposalSummary,
} from "./client";
import {
  governanceClient,
  type ListProposalChain,
  readChainClock,
  readListChain,
  readProposalChain,
  readVotingPower,
  resolveToken,
} from "./onchain";

/// The governor's clock in unix seconds, ticking locally and corrected by the chain's `clock()` offset.
export function useNowSeconds(tickMs = 1_000): number {
  const offset = useChainClockOffset();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now + offset;
}

/// Seconds the governor's clock is ahead of this browser's (negative if behind).
function useChainClockOffset(): number {
  const { chain, governor } = useGovernance();
  const polling = usePolling(GOVERNANCE_POLL_MS);
  const q = useQuery({
    queryKey: queryKeys.governanceClock(chain.chainId),
    enabled: governor !== undefined,
    queryFn: async () =>
      (await readChainClock(governanceClient(chain), governor!)) - Math.floor(Date.now() / 1000),
    ...polling,
  });
  return q.data ?? 0;
}

/// The active chain's governor and connected EVM account.
export interface GovernanceContext {
  chain: ChainEntry;
  /// Absent on a chain whose deployment runs no governance.
  governor: EvmAddress | undefined;
  /// The connected account, when it is an EVM one.
  account: EvmAddress | undefined;
}

/// The active chain's governor and the account reading it.
export function useGovernance(): GovernanceContext {
  const chain = useActiveChain();
  const { ethAddress } = useWallet();
  const account = useMemo(() => (ethAddress ? evmAddress(ethAddress) : undefined), [ethAddress]);
  return { chain, governor: chain.governorAddress, account };
}

/// An indexed proposal with its on-chain state, once read.
export interface ProposalListItem extends ProposalSummary {
  chain: ListProposalChain | undefined;
}

/// The indexed proposals, newest first, paged, each with its on-chain state and quorum.
export function useProposalList() {
  const { chain, governor } = useGovernance();
  const polling = usePolling(GOVERNANCE_POLL_MS);

  const pages = useInfiniteQuery({
    queryKey: queryKeys.governanceProposals(chain.chainId),
    enabled: governor !== undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchProposals(env.registryUrl, chain.chainId, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor,
    ...polling,
  });

  const summaries = useMemo(() => pages.data?.pages.flatMap((p) => p.items) ?? [], [pages.data]);
  const ids = summaries.map((s) => s.id).join(",");

  const onchain = useQuery({
    queryKey: queryKeys.governanceProposalStates(chain.chainId, ids),
    enabled: governor !== undefined && summaries.length > 0,
    queryFn: () => readListChain(governanceClient(chain), governor!, summaries),
    ...polling,
  });

  const items = useMemo<ProposalListItem[]>(
    () => summaries.map((s) => ({ ...s, chain: onchain.data?.get(s.id) })),
    [summaries, onchain.data],
  );

  return {
    items,
    isLoading: pages.isLoading,
    error: pages.error,
    hasMore: pages.hasNextPage,
    loadMore: () => void pages.fetchNextPage(),
    loadingMore: pages.isFetchingNextPage,
  };
}

/// One proposal: the indexed description and actions, and its live figures.
export function useProposal(proposalId: string) {
  const { chain, governor, account } = useGovernance();
  const polling = usePolling(GOVERNANCE_POLL_MS);

  const detail = useQuery({
    queryKey: queryKeys.governanceProposal(chain.chainId, proposalId),
    enabled: governor !== undefined,
    queryFn: ({ signal }) => fetchProposal(env.registryUrl, chain.chainId, proposalId, signal),
    ...polling,
  });

  const live = useQuery({
    queryKey: queryKeys.governanceProposalChain(chain.chainId, proposalId, account),
    enabled: governor !== undefined && isProposalId(proposalId),
    queryFn: () => readProposalChain(governanceClient(chain), governor!, proposalId, account),
    ...polling,
  });

  return { detail, live };
}

/// The indexed votes on one proposal, newest first, a page at a time.
export function useProposalVotes(proposalId: string) {
  const { chain, governor } = useGovernance();
  const q = useInfiniteQuery({
    queryKey: queryKeys.governanceVotes(chain.chainId, proposalId),
    enabled: governor !== undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchVotes(env.registryUrl, chain.chainId, proposalId, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor,
  });
  const votes = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  return {
    votes,
    isLoading: q.isLoading,
    error: q.error,
    hasMore: q.hasNextPage,
    loadMore: () => void q.fetchNextPage(),
    loadingMore: q.isFetchingNextPage,
  };
}

/// The connected account's LNT balance, delegate and voting power.
export function useVotingPower() {
  const { chain, governor, account } = useGovernance();
  return useQuery({
    queryKey: queryKeys.governanceVotingPower(chain.chainId, account),
    enabled: governor !== undefined && account !== undefined,
    queryFn: async () => {
      const client = governanceClient(chain);
      const token = await resolveToken(client, chain);
      if (!token) throw new Error("this chain names no voting token");
      return readVotingPower(client, governor!, token, account!);
    },
    ...usePolling(GOVERNANCE_POLL_MS),
  });
}
