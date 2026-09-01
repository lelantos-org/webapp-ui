// Recovering a note's cost basis: what the pool's yield index *was* at the block
// a note was credited at.
//
// One historical `eth_call` per distinct `(asset, block)` pair, answered off
// `yieldState` — the same call and the same shared ABI the SDK uses for the live
// figure, so the app holds no private description of the pool that could drift
// from it.
//
// Three caches sit in front of those calls, each for a different reason:
//
//   - `localStorage`, permanently. The index at a settled block never changes,
//     so a hit is never stale and nothing has to expire it.
//   - `refused`, for the session. A node with no archive state fails the same
//     block every time; without this the same doomed batch is re-issued on every
//     refresh.
//   - `clients`, per RPC URL. The viem client owns the batch scheduler and a
//     cached chainId, and rebuilding it discards both.
//
// See `yield-gains.ts` for what is done with the answers.

import type { EvmAddress } from "@lelantos-org/sdk";
import { MASP_ABI } from "@lelantos-org/sdk/chain";
import { createPublicClient, http, type PublicClient } from "viem";
import { chainKey } from "@/config/chains";
import { createLogger } from "@/shared/lib/logger";
import { localStore } from "@/shared/lib/storage";
import type { RegisteredAsset } from "./registered-assets";
import {
  type BasisNote,
  computeGains,
  earningAssets,
  NO_GAINS,
  type YieldGains,
} from "./yield-gains";

const log = createLogger("yield-index");

/// Historical reads issued in one batch.
///
/// One `eth_call` per *distinct* block, not per note, and every answer is cached
/// forever — a wallet re-reads only the blocks its newest notes landed in. The
/// batching exists for the cold case: a wallet restored onto a fresh device
/// resolves its whole history at once, and one JSON-RPC array of a few hundred
/// archive calls is a rate-limit rather than a page load. Batches are awaited in
/// sequence, so a large backlog converges within the one refresh that found it
/// rather than depending on the query being re-run.
const READS_PER_BATCH = 64;

/// Cache key for one resolved historical index. Chain-scoped and block-scoped,
/// which together make the value immutable: the index at a settled block never
/// changes, so a hit is never stale and nothing has to expire it.
///
/// `chainKey` rather than the decimal id, so this namespace spells a chain the
/// same way every other cache in the app does.
const cacheKey = (chainId: bigint, asset: bigint, block: number) =>
  `lelantos:yield-idx:${chainKey(chainId)}:${asset}:${block}`;

function readCached(chainId: bigint, asset: bigint, block: number): bigint | undefined {
  const raw = localStore.get(cacheKey(chainId, asset, block));
  if (raw === undefined) return undefined;
  try {
    return BigInt(raw);
  } catch {
    // Hand-edited or written by a build that stored something else. Treated as
    // a miss, which costs one re-read.
    return undefined;
  }
}

/// Blocks this session has already asked for and been refused.
///
/// Not persisted: a node with no archive state fails the same block every time,
/// so without this the same doomed batch is re-issued on every refresh for the
/// life of the session. A node that gains history mid-session is picked up by a
/// reload.
const refused = new Set<string>();

/// One viem client per RPC URL, rather than one per query run.
///
/// The client owns the batch scheduler and a cached chainId; rebuilding it
/// discards both. Keyed by URL so a chain switch gets its own.
const clients = new Map<string, PublicClient>();

function clientFor(rpcUrl: string): PublicClient {
  const existing = clients.get(rpcUrl);
  if (existing) return existing;
  // `batch` coalesces the historical reads into a single JSON-RPC array.
  const created = createPublicClient({ transport: http(rpcUrl, { batch: true }) });
  clients.set(rpcUrl, created);
  return created;
}

/**
 * Split a note set's distinct `(asset, block)` pairs into the ones already
 * answered and the ones still to ask for.
 *
 * One `localStorage` read and one `BigInt` parse per *distinct block*, and the
 * hits are carried out in `resolved` rather than thrown away — `computeGains`
 * then asks once per note and gets a `Map` lookup. Reading per note instead
 * would parse a 30-digit decimal thousands of times for the same few answers.
 *
 * Blocks already refused this session are skipped entirely; see {@link refused}.
 */
function partitionBlocks(
  notes: readonly BasisNote[],
  byId: ReadonlyMap<bigint, RegisteredAsset>,
  chainId: bigint,
): { resolved: Map<string, bigint>; missing: { asset: bigint; block: number }[] } {
  const resolved = new Map<string, bigint>();
  const seen = new Set<string>();
  const missing: { asset: bigint; block: number }[] = [];

  for (const n of notes) {
    if (n.firstSeenBlock === undefined || !byId.has(n.asset)) continue;
    const key = cacheKey(chainId, n.asset, n.firstSeenBlock);
    if (seen.has(key) || refused.has(key)) continue;
    seen.add(key);
    const cached = readCached(chainId, n.asset, n.firstSeenBlock);
    if (cached === undefined) missing.push({ asset: n.asset, block: n.firstSeenBlock });
    else resolved.set(key, cached);
  }
  return { resolved, missing };
}

export interface ResolveArgs {
  chainId: bigint;
  rpcUrl: string;
  maspAddress: EvmAddress;
  notes: readonly BasisNote[];
  assets: readonly RegisteredAsset[];
}

/**
 * Fill the cache with whatever historical indices are still missing, then fold
 * the notes into per-asset gains.
 *
 * A failure is per block and not fatal: an RPC that pruned its state answers
 * some blocks and not others, and the assets whose basis did resolve are still
 * worth showing. A refusal is remembered for the session so the same call is not
 * re-issued on every refresh.
 */
export async function resolveGains({
  chainId,
  rpcUrl,
  maspAddress,
  notes,
  assets,
}: ResolveArgs): Promise<YieldGains> {
  const byId = earningAssets(assets);
  if (byId.size === 0) return NO_GAINS;

  const { resolved, missing } = partitionBlocks(notes, byId, chainId);
  const refusedBefore = refused.size;

  for (let i = 0; i < missing.length; i += READS_PER_BATCH) {
    const batch = missing.slice(i, i + READS_PER_BATCH);
    const results = await Promise.allSettled(
      batch.map(async ({ asset, block }) => {
        const state = await clientFor(rpcUrl).readContract({
          address: maspAddress,
          abi: MASP_ABI,
          functionName: "yieldState",
          args: [asset],
          blockNumber: BigInt(block),
        });
        const key = cacheKey(chainId, asset, block);
        localStore.set(key, state.index.toString());
        resolved.set(key, state.index);
      }),
    );
    for (const [j, r] of results.entries()) {
      if (r.status === "fulfilled") continue;
      const { asset, block } = batch[j] as { asset: bigint; block: number };
      refused.add(cacheKey(chainId, asset, block));
    }
  }

  // One line rather than one per block, and only for what this run newly
  // learned: a node without archive state refuses every block it is asked
  // about, and the interesting fact is the count, not the list.
  const newlyRefused = refused.size - refusedBefore;
  if (newlyRefused > 0) log.debug(`no historical index for ${newlyRefused}/${missing.length}`);

  return computeGains(notes, assets, (asset, block) =>
    resolved.get(cacheKey(chainId, asset, block)),
  );
}
