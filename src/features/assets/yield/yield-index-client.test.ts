import { describe, expect, it } from "vitest";
import { indexAtBlock, parseYieldIndex, type YieldSample } from "./yield-index-client";

const RAY = 10n ** 27n;

/// A series at blocks 100/200/300 with the index rising by one RAY-tenth each.
const SERIES: YieldSample[] = [
  { block: 100, indexRay: RAY },
  { block: 200, indexRay: RAY + RAY / 10n },
  { block: 300, indexRay: RAY + RAY / 5n },
];

describe("indexAtBlock", () => {
  it("returns a reading exactly when the block has one", () => {
    for (const s of SERIES) {
      expect(indexAtBlock(SERIES, s.block)).toBe(s.indexRay);
    }
  });

  it("interpolates between the two readings that bracket a block", () => {
    // Halfway between 100 and 200, so half the growth across that interval.
    expect(indexAtBlock(SERIES, 150)).toBe(RAY + RAY / 20n);
    // A quarter of the way.
    expect(indexAtBlock(SERIES, 125)).toBe(RAY + RAY / 40n);
  });

  /// Nothing was recorded that far back, so the basis is genuinely unknown.
  /// Answering with the earliest reading would overstate the basis of every note
  /// older than the history and understate what it earned.
  it("returns undefined below the first reading", () => {
    expect(indexAtBlock(SERIES, 99)).toBeUndefined();
    expect(indexAtBlock(SERIES, 0)).toBeUndefined();
  });

  /// A note newer than the last sample is at most one sampling interval old, so
  /// its basis is within that interval's growth of the last index and its gain
  /// is ~0 — which is correct, not a guess.
  it("takes the last reading above the end of the series", () => {
    expect(indexAtBlock(SERIES, 301)).toBe(RAY + RAY / 5n);
    expect(indexAtBlock(SERIES, 10_000_000)).toBe(RAY + RAY / 5n);
  });

  it("answers a single-reading series with that reading, at or after its block", () => {
    const one: YieldSample[] = [{ block: 100, indexRay: RAY }];
    expect(indexAtBlock(one, 100)).toBe(RAY);
    expect(indexAtBlock(one, 500)).toBe(RAY);
    expect(indexAtBlock(one, 99)).toBeUndefined();
  });

  it("returns undefined for an empty series", () => {
    expect(indexAtBlock([], 100)).toBeUndefined();
  });

  /// A RAY index is ~1e27, far outside the exact range of a double. Any float
  /// arithmetic in the interpolation would silently round the basis.
  it("keeps full precision across an interpolation", () => {
    const exact: YieldSample[] = [
      { block: 0, indexRay: 1_000_000_000_000_000_000_000_000_001n },
      { block: 2, indexRay: 1_000_000_000_000_000_000_000_000_003n },
    ];
    expect(indexAtBlock(exact, 1)).toBe(1_000_000_000_000_000_000_000_000_002n);
  });

  /// A venue can lose, so the series is not always rising. The answer must still
  /// land between the two readings rather than being clamped.
  it("interpolates downward across a loss", () => {
    const loss: YieldSample[] = [
      { block: 100, indexRay: 2n * RAY },
      { block: 200, indexRay: RAY },
    ];
    expect(indexAtBlock(loss, 150)).toBe(RAY + RAY / 2n);
  });

  /// The binary search has to find the right bracket across a long series, not
  /// just a three-element one.
  it("finds the right bracket in a long series", () => {
    const long: YieldSample[] = Array.from({ length: 1000 }, (_, i) => ({
      block: i * 10,
      indexRay: BigInt(i) * RAY,
    }));
    expect(indexAtBlock(long, 5_000)).toBe(500n * RAY);
    // Midway between blocks 5000 and 5010.
    expect(indexAtBlock(long, 5_005)).toBe(500n * RAY + RAY / 2n);
  });
});

describe("parseYieldIndex", () => {
  const body = {
    chainId: 1,
    assets: [
      { assetId: 7, samples: [{ block: 100, indexRay: "1000" }] },
      { assetId: 8, samples: [{ block: 200, indexRay: "2000" }] },
    ],
  };

  it("indexes each asset's series by id", () => {
    const series = parseYieldIndex(body);
    expect(series.get(7n)).toEqual([{ block: 100, indexRay: 1000n }]);
    expect(series.get(8n)).toEqual([{ block: 200, indexRay: 2000n }]);
  });

  /// The wire carries the index as a decimal string precisely because it exceeds
  /// what a JSON number holds; parsing it as one would round it.
  it("reads an index beyond float precision exactly", () => {
    const big = "1000000000000000000000000000001";
    const series = parseYieldIndex({
      chainId: 1,
      assets: [{ assetId: 7, samples: [{ block: 1, indexRay: big }] }],
    });
    expect(series.get(7n)?.[0]?.indexRay).toBe(BigInt(big));
  });

  /// One malformed reading costs its own block, not the asset's whole column.
  it("drops an unparseable reading and keeps the rest", () => {
    const series = parseYieldIndex({
      chainId: 1,
      assets: [
        {
          assetId: 7,
          samples: [
            { block: 1, indexRay: "not-a-number" },
            { block: 2, indexRay: "2000" },
          ],
        },
      ],
    });
    expect(series.get(7n)).toEqual([{ block: 2, indexRay: 2000n }]);
  });

  it("omits an asset whose readings all fail to parse", () => {
    const series = parseYieldIndex({
      chainId: 1,
      assets: [{ assetId: 7, samples: [{ block: 1, indexRay: "x" }] }],
    });
    expect(series.has(7n)).toBe(false);
  });

  it("treats a body of the wrong shape as no series", () => {
    for (const bad of [null, undefined, {}, { chainId: 1 }, "nope", { assets: [] }]) {
      expect(parseYieldIndex(bad).size).toBe(0);
    }
  });
});
