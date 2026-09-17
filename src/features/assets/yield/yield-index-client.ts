// One request per chain, identical for every wallet. Never query per note block: privacy.

import { z } from "zod";

/// One reading, as held in memory.
export interface YieldSample {
  block: number;
  indexRay: bigint;
}

/// Per-asset series, oldest block first.
export type YieldIndexSeries = ReadonlyMap<bigint, readonly YieldSample[]>;

export const NO_SERIES: YieldIndexSeries = new Map();

/// `indexRay` is a decimal string: a RAY index exceeds a JSON number's precision.
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

/// Fetch one chain's history. Rejects on failure, since an empty body means nothing sampled yet.
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

/// Validate a response body and index it by asset, dropping readings that do not parse.
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

/// The index at `block`, interpolated between the readings of an ascending series that bracket it.
/// `undefined` before the first reading; the last reading after the end.
export function indexAtBlock(samples: readonly YieldSample[], block: number): bigint | undefined {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return undefined;
  if (block < first.block) return undefined;
  if (block >= last.block) return last.indexRay;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const at = samples[mid];
    if (at !== undefined && at.block <= block) lo = mid;
    else hi = mid - 1;
  }

  const before = samples[lo];
  const after = samples[lo + 1];
  if (before === undefined) return undefined;
  if (before.block === block || after === undefined) return before.indexRay;

  // Integer arithmetic only: a RAY index has no exact float representation.
  const span = BigInt(after.block - before.block);
  if (span === 0n) return before.indexRay;
  const grown = (after.indexRay - before.indexRay) * BigInt(block - before.block);
  return before.indexRay + grown / span;
}
