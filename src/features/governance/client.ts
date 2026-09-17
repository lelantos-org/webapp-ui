// protocol-webserver's governance index: the proposals the governor has seen
// created, their indexed tallies, and the votes cast on each.
//
// The governor keeps no enumerable list of proposals, so the index is the only
// way to find them. It is not the authority on anything that depends on time or
// on the snapshot — a proposal's state, its quorum, whether a vote counts — and
// never claims to be: those are read from the chain beside it (`onchain.ts`).
//
// Every figure that can exceed a JSON number arrives as a decimal string and is
// held as a bigint; timestamps and block numbers are plain numbers.

import { z } from "zod";

/// A uint256 on the wire.
const decimal = z.string().regex(/^\d+$/, "expected a decimal integer");
const hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "expected 0x hex");

const talliesRow = z.object({ for: decimal, against: decimal, abstain: decimal });

const summaryRow = z.object({
  proposalId: decimal,
  proposer: z.string(),
  title: z.string(),
  voteStart: z.number(),
  voteEnd: z.number(),
  quorumVoteDeadline: z.number().optional(),
  createdBlock: z.number(),
  createdTx: z.string(),
  queuedAtBlock: z.number().optional(),
  eta: z.number().optional(),
  executedAtBlock: z.number().optional(),
  canceledAtBlock: z.number().optional(),
  tallies: talliesRow,
  voteCount: z.number(),
});

const actionRow = z.object({
  target: z.string(),
  value: decimal,
  signature: z.string(),
  calldata: hex,
});

const detailRow = summaryRow.extend({
  description: z.string(),
  actions: z.array(actionRow),
});

const voteRow = z.object({
  voter: z.string(),
  support: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  weight: decimal,
  reason: z.string(),
  blockNumber: z.number(),
  txHash: z.string(),
});

const proposalsBody = z.object({
  proposals: z.array(z.unknown()),
  nextCursor: z.string().optional(),
});

const votesBody = z.object({
  votes: z.array(z.unknown()),
  nextCursor: z.string().optional(),
});

/// For / Against / Abstain weights, in the token's base units.
export interface Tallies {
  for: bigint;
  against: bigint;
  abstain: bigint;
}

export interface ProposalSummary {
  /// Decimal. Kept as text: it is a keccak-sized uint256, used as a route segment
  /// and a key, and only converted where a contract call takes it.
  id: string;
  proposer: string;
  title: string;
  /// Unix seconds. The governor runs on the token's timestamp clock.
  voteStart: number;
  voteEnd: number;
  /// After this For and Abstain are refused; Against stays open to `voteEnd`.
  /// Absent where the indexer has not seen `ProposalQuorumVoteDeadline`.
  quorumVoteDeadline?: number | undefined;
  createdBlock: number;
  createdTx: string;
  queuedAtBlock?: number | undefined;
  eta?: number | undefined;
  executedAtBlock?: number | undefined;
  canceledAtBlock?: number | undefined;
  tallies: Tallies;
  voteCount: number;
}

export interface ProposalAction {
  target: string;
  value: bigint;
  /// The legacy signature string. OZ Governor v5 emits it empty.
  signature: string;
  calldata: `0x${string}`;
}

export interface ProposalDetail extends ProposalSummary {
  description: string;
  actions: ProposalAction[];
}

export type VoteSupport = 0 | 1 | 2;

export interface ProposalVote {
  voter: string;
  support: VoteSupport;
  weight: bigint;
  reason: string;
  blockNumber: number;
  txHash: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string | undefined;
}

type SummaryRow = z.infer<typeof summaryRow>;

function toSummary(r: SummaryRow): ProposalSummary {
  return {
    id: r.proposalId,
    proposer: r.proposer,
    title: r.title,
    voteStart: r.voteStart,
    voteEnd: r.voteEnd,
    quorumVoteDeadline: r.quorumVoteDeadline,
    createdBlock: r.createdBlock,
    createdTx: r.createdTx,
    queuedAtBlock: r.queuedAtBlock,
    eta: r.eta,
    executedAtBlock: r.executedAtBlock,
    canceledAtBlock: r.canceledAtBlock,
    tallies: {
      for: BigInt(r.tallies.for),
      against: BigInt(r.tallies.against),
      abstain: BigInt(r.tallies.abstain),
    },
    voteCount: r.voteCount,
  };
}

/// Each row checked on its own, so one malformed proposal costs its own line
/// rather than the whole page. The envelope still has to parse: a body of the
/// wrong shape is a service fault and is reported as one.
function rows<T, R>(raw: unknown[], schema: z.ZodType<R>, map: (r: R) => T): T[] {
  const out: T[] = [];
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(map(parsed.data));
  }
  return out;
}

export function parseProposalsPage(body: unknown): Page<ProposalSummary> {
  const env = proposalsBody.parse(body);
  return {
    items: rows(env.proposals, summaryRow, toSummary),
    nextCursor: env.nextCursor,
  };
}

export function parseProposalDetail(body: unknown): ProposalDetail {
  const r = detailRow.parse(body);
  return {
    ...toSummary(r),
    description: r.description,
    actions: r.actions.map((a) => ({
      target: a.target,
      value: BigInt(a.value),
      signature: a.signature,
      calldata: a.calldata as `0x${string}`,
    })),
  };
}

export function parseVotesPage(body: unknown): Page<ProposalVote> {
  const env = votesBody.parse(body);
  return {
    items: rows(env.votes, voteRow, (v) => ({ ...v, weight: BigInt(v.weight) })),
    nextCursor: env.nextCursor,
  };
}

/// Thrown for a 404: an unknown chain or proposal, as opposed to a service fault.
export class GovernanceNotFound extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "GovernanceNotFound";
  }
}

async function getJson(url: string, signal: AbortSignal | undefined, what: string) {
  const r = await fetch(url, signal ? { signal } : {});
  if (r.status === 404) throw new GovernanceNotFound(what);
  if (!r.ok) throw new Error(`registry ${what} responded ${r.status}`);
  return r.json();
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  return q.toString();
}

/// Whether a string can be a proposal id: a decimal uint256. Ids come from the
/// route, so anything else names no proposal.
export function isProposalId(id: string): boolean {
  return /^\d+$/.test(id);
}

/// Rejects the id before it reaches a path.
function proposalPath(proposalId: string): string {
  if (!isProposalId(proposalId)) throw new GovernanceNotFound("proposal");
  return `/v1/governance/proposals/${proposalId}`;
}

export async function fetchProposals(
  registryUrl: string,
  chainId: bigint,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<ProposalSummary>> {
  const url = `${registryUrl}/v1/governance/proposals?${query({ chainId: chainId.toString(), cursor, limit: 20 })}`;
  return parseProposalsPage(await getJson(url, signal, "/v1/governance/proposals"));
}

export async function fetchProposal(
  registryUrl: string,
  chainId: bigint,
  proposalId: string,
  signal?: AbortSignal,
): Promise<ProposalDetail> {
  const url = `${registryUrl}${proposalPath(proposalId)}?${query({ chainId: chainId.toString() })}`;
  return parseProposalDetail(await getJson(url, signal, "proposal"));
}

export async function fetchVotes(
  registryUrl: string,
  chainId: bigint,
  proposalId: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<Page<ProposalVote>> {
  const url = `${registryUrl}${proposalPath(proposalId)}/votes?${query({ chainId: chainId.toString(), cursor, limit: 25 })}`;
  return parseVotesPage(await getJson(url, signal, "votes"));
}
