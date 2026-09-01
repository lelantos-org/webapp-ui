// Measuring the venue rate `venue-apy.ts` annualizes.
//
// The pool publishes no rate, so one is sampled: today's index against the same
// asset's index a week ago, with the seconds between them taken from the two
// blocks' own timestamps rather than assumed from a block time.
//
// Which block is "a week ago" is not knowable without asking. Block time varies
// by chain and by congestion, so the target is estimated from a probe — two
// headers, the seconds between them, divided — and then the block that estimate
// lands on has its *actual* timestamp read. The estimate only has to be close;
// the arithmetic uses what the chain says the window really was.
//
// Cost per run: three block headers, plus one historical `eth_call` per earning
// asset, all of them cached by `yield-index.ts` for the life of the device. The
// historical read needs archive state exactly as the cost basis does, so on a
// pruned node this degrades the same way — no badge figure, everything else
// unchanged.

import { useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import type { RegisteredAsset } from "./registered-assets";
import { annualize, NO_APYS, type VenueApys, windowStartBlock } from "./venue-apy";
import { clientFor, indexAtBlock } from "./yield-index";

/// Blocks back for the block-time probe.
///
/// Only sizes the estimate of where the window starts, so it does not have to be
/// right — large enough that a few slow blocks do not skew the average, small
/// enough to exist on a young chain. A chain shorter than this probes from its
/// genesis instead.
const PROBE_BLOCKS = 5_000n;

/**
 * Annualized venue rates for the active chain's earning assets.
 *
 * Not wallet-scoped: this describes the venue, not a position, so it is the same
 * answer for every wallet and is cached and fetched as such — it resolves before
 * a wallet connects and survives a disconnect.
 *
 * Never surfaces an error. A node that cannot answer, a chain younger than the
 * window, a venue that has been reindexed — each drops that asset from the map,
 * and the badge falls back to saying only that the asset earns.
 */
export function useVenueApy(): VenueApys {
  const chain = useActiveChain();
  const earning = chain.tokens.filter((a) => a.yieldEnabled && !a.yieldHalted);

  const query = useQuery({
    queryKey: [
      "venue-apy",
      chain.chainId.toString(),
      earning.map((a) => a.id.toString()).join(","),
    ],
    enabled: earning.length > 0,
    // A rate measured over a week does not move in ten minutes, and every input
    // behind it is cached; refetching sooner would spend archive calls to
    // redraw the same two decimals.
    staleTime: 10 * 60 * 1000,
    queryFn: () =>
      sampleApys({
        chainId: chain.chainId,
        rpcUrl: chain.rpcUrl,
        maspAddress: chain.maspAddress,
        assets: earning,
      }),
  });

  return query.data ?? NO_APYS;
}

export interface SampleArgs {
  chainId: bigint;
  rpcUrl: string;
  maspAddress: RegisteredAsset["token"];
  assets: readonly RegisteredAsset[];
}

/**
 * Take both samples and fold them into rates.
 *
 * The recent sample is `asset.index` — already on the registry, already as fresh
 * as the relayer's last poll, and one RPC round trip cheaper than reading it
 * again. It is paired with the head block's timestamp, which is within a poll of
 * when it was true; over a week-long window that skew moves the fourth decimal
 * of a percentage.
 */
export async function sampleApys({
  chainId,
  rpcUrl,
  maspAddress,
  assets,
}: SampleArgs): Promise<VenueApys> {
  const client = clientFor(rpcUrl);
  const head = await client.getBlock();

  // Where the window starts, estimated from a probe's block time — see
  // `windowStartBlock`. A chain younger than the window has no answer, and gets
  // no rate rather than one measured over whatever it has.
  const probeAt = head.number > PROBE_BLOCKS ? head.number - PROBE_BLOCKS : 0n;
  const probe = await client.getBlock({ blockNumber: probeAt });
  const targetAt = windowStartBlock({
    headNumber: head.number,
    headSeconds: Number(head.timestamp),
    probeNumber: probeAt,
    probeSeconds: Number(probe.timestamp),
  });
  if (targetAt === undefined) return NO_APYS;
  const target = await client.getBlock({ blockNumber: targetAt });

  const now = Number(head.timestamp);
  const then = Number(target.timestamp);
  const block = Number(targetAt);

  // Settled, not `all`: one asset whose venue was bound after the target block
  // has no state to read there, and it must not take the rest of the column
  // down with it.
  const sampled = await Promise.allSettled(
    assets.map(async (a) => {
      const was = await indexAtBlock({ chainId, rpcUrl, maspAddress, asset: a.id, block });
      if (was === undefined) return undefined;
      const apy = annualize({ index: a.index, at: now }, { index: was, at: then });
      return apy === undefined ? undefined : ([a.id, apy] as const);
    }),
  );

  const out = new Map<bigint, number>();
  for (const r of sampled) {
    if (r.status === "fulfilled" && r.value) out.set(r.value[0], r.value[1]);
  }
  return out;
}
