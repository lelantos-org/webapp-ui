// Live governance reads, straight from the chain.
//
// Everything that depends on the clock or on a snapshot is read here rather than
// trusted to the index: a proposal's state, its quorum, whether this account has
// voted and with what weight. The reads go through the chain's `readRpcUrl` as
// plain `eth_call`s fanned out with `Promise.all` — not Multicall3, which a local
// anvil does not have.

import type { EvmAddress } from "@lelantos-org/sdk";
import { createPublicClient, http, type PublicClient } from "viem";
import type { ChainEntry } from "@/config/chains";
import { governorAbi, govTokenAbi } from "./abi";
import type { Tallies } from "./client";
import { type ProposalState, proposalStateOf } from "./model";

const clients = new Map<string, PublicClient>();

/// One client per read endpoint, shared by every read and receipt wait on it.
export function governanceClient(chain: Pick<ChainEntry, "readRpcUrl">): PublicClient {
  let c = clients.get(chain.readRpcUrl);
  if (!c) {
    c = createPublicClient({ transport: http(chain.readRpcUrl) });
    clients.set(chain.readRpcUrl, c);
  }
  return c;
}

/// The subset of a public client these reads use, so tests can hand in a fake.
export type GovReader = Pick<PublicClient, "readContract">;

/// A read that may revert for a reason that just means "not known yet" —
/// `quorum` at a future timepoint, `state` of a proposal the index is ahead of.
async function maybe<T>(read: Promise<T>): Promise<T | undefined> {
  try {
    return await read;
  } catch {
    return undefined;
  }
}

/// A proposal id as the contract takes it.
function pid(id: string): bigint {
  return BigInt(id);
}

/// The governor's clock, in seconds.
export async function readChainClock(client: GovReader, governor: EvmAddress): Promise<number> {
  const clock = await client.readContract({
    address: governor,
    abi: governorAbi,
    functionName: "clock",
  });
  return Number(clock);
}

export interface ListProposalChain {
  state: ProposalState | undefined;
  /// Undefined while the snapshot is still in the future.
  quorum: bigint | undefined;
}

/// The state and quorum of each listed proposal.
///
/// `snapshot` is the proposal's `voteStart`, which is what OZ's
/// `proposalSnapshot` returns. The quorum read is skipped until the snapshot has
/// passed: the token refuses a lookup at a timepoint it has not reached.
export async function readListChain(
  client: GovReader,
  governor: EvmAddress,
  proposals: readonly { id: string; voteStart: number }[],
): Promise<Map<string, ListProposalChain>> {
  // The governor's clock, not the browser's: they can disagree by minutes (a
  // skewed laptop, an anvil moved with `evm_increaseTime`), and the token
  // refuses a quorum lookup at a timepoint the chain has not reached.
  const nowSec = await readChainClock(client, governor);
  const rows = await Promise.all(
    proposals.map(async (p): Promise<[string, ListProposalChain]> => {
      const [state, quorum] = await Promise.all([
        maybe(
          client.readContract({
            address: governor,
            abi: governorAbi,
            functionName: "state",
            args: [pid(p.id)],
          }),
        ),
        p.voteStart < nowSec
          ? maybe(
              client.readContract({
                address: governor,
                abi: governorAbi,
                functionName: "quorum",
                args: [BigInt(p.voteStart)],
              }),
            )
          : Promise.resolve(undefined),
      ]);
      return [p.id, { state: state === undefined ? undefined : proposalStateOf(state), quorum }];
    }),
  );
  return new Map(rows);
}

export interface ProposalChain {
  state: ProposalState | undefined;
  tallies: Tallies;
  snapshot: bigint;
  deadline: bigint;
  /// Undefined against a governor without the quorum-vote window.
  quorumVoteDeadline: bigint | undefined;
  quorum: bigint | undefined;
  /// The governor's clock now, in seconds.
  clock: bigint;
  /// Present only when an account was given.
  account?:
    | {
        hasVoted: boolean;
        votesAtSnapshot: bigint;
      }
    | undefined;
}

/// Everything the detail screen needs about one proposal, as `account` sees it.
export async function readProposalChain(
  client: GovReader,
  governor: EvmAddress,
  proposalId: string,
  account: EvmAddress | undefined,
): Promise<ProposalChain> {
  const id = pid(proposalId);
  const g = { address: governor, abi: governorAbi } as const;
  const [state, votes, snapshot, deadline, quorumVoteDeadline, clock] = await Promise.all([
    maybe(client.readContract({ ...g, functionName: "state", args: [id] })),
    client.readContract({ ...g, functionName: "proposalVotes", args: [id] }),
    client.readContract({ ...g, functionName: "proposalSnapshot", args: [id] }),
    client.readContract({ ...g, functionName: "proposalDeadline", args: [id] }),
    maybe(client.readContract({ ...g, functionName: "proposalQuorumVoteDeadline", args: [id] })),
    client.readContract({ ...g, functionName: "clock" }),
  ]);
  const snapshotPassed = snapshot < BigInt(clock);
  const [quorum, hasVoted, votesAtSnapshot] = await Promise.all([
    snapshotPassed
      ? maybe(client.readContract({ ...g, functionName: "quorum", args: [snapshot] }))
      : Promise.resolve(undefined),
    account
      ? client.readContract({ ...g, functionName: "hasVoted", args: [id, account] })
      : Promise.resolve(false),
    account && snapshotPassed
      ? client.readContract({ ...g, functionName: "getVotes", args: [account, snapshot] })
      : Promise.resolve(0n),
  ]);
  const [against, forVotes, abstain] = votes;
  return {
    state: state === undefined ? undefined : proposalStateOf(state),
    tallies: { for: forVotes, against, abstain },
    snapshot,
    deadline,
    // A governor predating the quorum-vote window has no such function; zero is
    // what an unknown proposal reports, and neither is a real deadline.
    quorumVoteDeadline: quorumVoteDeadline ? quorumVoteDeadline : undefined,
    quorum,
    clock: BigInt(clock),
    account: account ? { hasVoted, votesAtSnapshot } : undefined,
  };
}

export interface VotingPower {
  token: EvmAddress;
  symbol: string;
  decimals: number;
  /// Transparent LNT held by the account. Shielded LNT is not here and carries
  /// no votes.
  balance: bigint;
  /// The zero address until the account first delegates.
  delegate: EvmAddress;
  /// Votes now.
  votes: bigint;
  /// Votes one second ago: what `propose` checks against the threshold.
  proposeVotes: bigint;
  threshold: bigint;
}

/// The voting token: the registry's, or the governor's own `token()`.
export async function resolveToken(
  client: GovReader,
  chain: Pick<ChainEntry, "governorAddress" | "govTokenAddress">,
): Promise<EvmAddress | undefined> {
  if (chain.govTokenAddress) return chain.govTokenAddress;
  if (!chain.governorAddress) return undefined;
  return (await client.readContract({
    address: chain.governorAddress,
    abi: governorAbi,
    functionName: "token",
  })) as EvmAddress;
}

export async function readVotingPower(
  client: GovReader,
  governor: EvmAddress,
  token: EvmAddress,
  account: EvmAddress,
): Promise<VotingPower> {
  const t = { address: token, abi: govTokenAbi } as const;
  const g = { address: governor, abi: governorAbi } as const;
  const [symbol, decimals, balance, delegate, votes, threshold, clock] = await Promise.all([
    maybe(client.readContract({ ...t, functionName: "symbol" })),
    maybe(client.readContract({ ...t, functionName: "decimals" })),
    client.readContract({ ...t, functionName: "balanceOf", args: [account] }),
    client.readContract({ ...t, functionName: "delegates", args: [account] }),
    client.readContract({ ...t, functionName: "getVotes", args: [account] }),
    client.readContract({ ...g, functionName: "proposalThreshold" }),
    client.readContract({ ...g, functionName: "clock" }),
  ]);
  const past = BigInt(clock) - 1n;
  const proposeVotes =
    past >= 0n
      ? await client.readContract({ ...g, functionName: "getVotes", args: [account, past] })
      : 0n;
  return {
    token,
    symbol: symbol ?? "LNT",
    decimals: decimals ?? 18,
    balance,
    delegate: delegate as EvmAddress,
    votes,
    proposeVotes,
    threshold,
  };
}
