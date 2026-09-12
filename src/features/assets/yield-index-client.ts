// The recorded yield-index history, and reading a past index out of it.
//
// One request per chain, with a body identical for every wallet, so it reveals
// nothing about who asked. Never read the index per note block: the set of
// blocks asked about is the wallet's note set, and whoever serves those calls
// could pair it with an IP.
//
// The series is sampled, not per-block, so a basis is interpolated between the
// two readings bracketing a note's block. The index is monotonic except across a
// venue loss, so the answer always lies between two real readings; the error is
// bounded by the index's growth across one sampling interval, which is far below
// display tolerance. See `yield-gains.ts` for what is done with the answer.

import { z } from "zod";

/// One reading, as held in memory.
export interface YieldSample {
  block: number;
  indexRay: bigint;
}

/// Per-asset series, oldest block first.
export type YieldIndexSeries = ReadonlyMap<bigint, readonly YieldSample[]>;

export const NO_SERIES: YieldIndexSeries = new Map();

/// `indexRay` is a decimal string on the wire: a RAY-scaled index exceeds what a
/// JSON number holds exactly.
const sampleRow = z.object({
  block: z.number(),
  indexRay: z.string(),
});

const assetRow = z.object({
  assetId: z.number(),
  samples: z.array(sampleRow),
});

const responseBody = z.object({
  chainId: z.number(),
  assets: z.array(assetRow),
});

/// Fetch one chain's history.
///
/// Rejects rather than resolving empty when the service cannot be read: an empty
/// body is a valid answer meaning "nothing sampled yet", and collapsing the two
/// would render an unreachable registry as a chain that simply has no history.
export async function fetchYieldIndex(
  registryUrl: string,
  chainId: bigint,
  signal?: AbortSignal,
): Promise<YieldIndexSeries> {
  const url = `${registryUrl}/v1/yield-index?chainId=${chainId}`;
  const r = await fetch(url, signal ? { signal } : {});
  if (!r.ok) throw new Error(`registry /v1/yield-index responded ${r.status}`);
  return parseYieldIndex(await r.json());
}

/// Validate and index a response body by asset.
///
/// An entry that does not parse is dropped rather than failing the whole body:
/// one malformed asset costs its own column, where rejecting everything would
/// cost every asset's.
export function parseYieldIndex(body: unknown): YieldIndexSeries {
  const parsed = responseBody.safeParse(body);
  if (!parsed.success) return NO_SERIES;

  const out = new Map<bigint, YieldSample[]>();
  for (const asset of parsed.data.assets) {
    const samples: YieldSample[] = [];
    for (const s of asset.samples) {
      try {
        samples.push({ block: s.block, indexRay: BigInt(s.indexRay) });
      } catch {
        // Not a decimal integer; that reading is skipped.
      }
    }
    if (samples.length > 0) out.set(BigInt(asset.assetId), samples);
  }
  return out;
}

/// The index at `block`, interpolated between the readings that bracket it.
///
/// `undefined` when the series starts after `block`: nothing was recorded that
/// far back, and the note's basis is genuinely unknown. Assuming the earliest
/// reading instead would overstate the basis of every note older than the
/// history and silently understate what it earned.
///
/// A block past the last reading takes that reading. Such a note is newer than
/// the most recent sample — at most one sampling interval old — so its true basis
/// is within that interval's growth of the last index, and its gain is ~0.
///
/// `samples` must be ascending by block, which the endpoint guarantees.
export function indexAtBlock(samples: readonly YieldSample[], block: number): bigint | undefined {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return undefined;
  if (block < first.block) return undefined;
  if (block >= last.block) return last.indexRay;

  // The last reading at or before `block`. Binary search rather than a scan: a
  // year of history is a few thousand readings and this runs once per note.
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    // Guarded index: `mid` is within bounds, but `noUncheckedIndexedAccess`
    // cannot see that.
    const at = samples[mid];
    if (at !== undefined && at.block <= block) lo = mid;
    else hi = mid - 1;
  }

  const before = samples[lo];
  const after = samples[lo + 1];
  if (before === undefined) return undefined;
  if (before.block === block || after === undefined) return before.indexRay;

  // Linear in block space. Integer arithmetic throughout: a RAY index has no
  // exact float representation, and the division truncates toward zero, which
  // for a rising index floors the basis and so understates the gain.
  const span = BigInt(after.block - before.block);
  if (span === 0n) return before.indexRay;
  const grown = (after.indexRay - before.indexRay) * BigInt(block - before.block);
  return before.indexRay + grown / span;
}
