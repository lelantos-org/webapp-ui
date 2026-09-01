// The venue rate's arithmetic. The sampling that feeds it is a fetch and lives
// in `use-venue-apy.ts`; what is worth pinning here is the refusal to turn a
// pair of readings into a rate they cannot support.

import { RAY } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import {
  annualize,
  formatApy,
  MAX_APY,
  MIN_WINDOW_SECONDS,
  WINDOW_SECONDS,
  windowStartBlock,
  YEAR_SECONDS,
} from "./venue-apy";

const DAY = 24 * 60 * 60;

/// An index `pct` percent above RAY, as the pool would carry it.
const idx = (pct: number) => (RAY * BigInt(Math.round(pct * 1e6))) / BigInt(1e6) / 100n + RAY;

describe("annualize", () => {
  it("compounds a window up to a year", () => {
    // 1% over ~91.25 days is four such windows in a year: 1.01^4 - 1.
    const apy = annualize({ index: idx(1), at: YEAR_SECONDS / 4 }, { index: RAY, at: 0 });
    expect(apy).toBeCloseTo(1.01 ** 4 - 1, 6);
  });

  it("is the growth itself over exactly a year", () => {
    const apy = annualize({ index: idx(5), at: YEAR_SECONDS }, { index: RAY, at: 0 });
    expect(apy).toBeCloseTo(0.05, 6);
  });

  // A window is a measurement, and a short one measures mostly its own edges:
  // annualizing an hour of drift produces a confident three-digit percentage
  // out of a rounding.
  it("refuses a window shorter than the floor", () => {
    const at = MIN_WINDOW_SECONDS - 1;
    expect(annualize({ index: idx(0.02), at }, { index: RAY, at: 0 })).toBeUndefined();
    // One second more is measurable, and is measured.
    expect(annualize({ index: idx(0.02), at: at + 1 }, { index: RAY, at: 0 })).toBeDefined();
  });

  it("returns a venue loss rather than clamping it", () => {
    const apy = annualize({ index: RAY, at: YEAR_SECONDS }, { index: idx(5), at: 0 });
    expect(apy).toBeLessThan(0);
    expect(apy).toBeCloseTo(1 / 1.05 - 1, 6);
  });

  // A pool reindexed inside the window leaves two readings with no common
  // basis. The ratio is arithmetic; the rate it implies is fiction.
  it("drops a result too large to be a rate", () => {
    const wild = { index: RAY * 10_000n, at: 30 * DAY };
    expect(annualize(wild, { index: RAY, at: 0 })).toBeUndefined();
    // The bound is on the annualized figure, not on the raw growth: a real 90%
    // year is high and is still a rate.
    const real = annualize({ index: idx(90), at: YEAR_SECONDS }, { index: RAY, at: 0 });
    expect(real).toBeCloseTo(0.9, 6);
    expect(real).toBeLessThan(MAX_APY);
  });

  it("has no answer without a basis sample", () => {
    expect(annualize({ index: RAY, at: 30 * DAY }, { index: 0n, at: 0 })).toBeUndefined();
    expect(annualize({ index: 0n, at: 30 * DAY }, { index: RAY, at: 0 })).toBeUndefined();
  });

  it("has no answer when the samples are out of order", () => {
    expect(annualize({ index: idx(1), at: 0 }, { index: RAY, at: 30 * DAY })).toBeUndefined();
  });

  // Both indices sit far above `Number.MAX_SAFE_INTEGER`, so the division has
  // to happen before anything becomes a float.
  it("keeps precision on RAY-scaled indices", () => {
    const then = RAY + 12_345_678_901_234_567_890n;
    const now = (then * 1_010_000_000n) / 1_000_000_000n;
    const apy = annualize({ index: now, at: YEAR_SECONDS }, { index: then, at: 0 });
    expect(apy).toBeCloseTo(0.01, 9);
  });
});

describe("formatApy", () => {
  it("keeps two decimals, so a rate is not read as a chosen round number", () => {
    expect(formatApy(0.0418)).toBe("4.18%");
    expect(formatApy(0.04)).toBe("4.00%");
    expect(formatApy(-0.0123)).toBe("-1.23%");
  });
});

describe("windowStartBlock", () => {
  /// A chain at `spb` seconds per block, `head` blocks long.
  const probe = (head: bigint, spb: number, back = 5_000n) => ({
    headNumber: head,
    headSeconds: 1_000_000,
    probeNumber: head - back,
    probeSeconds: 1_000_000 - Number(back) * spb,
  });

  it("converts the window into blocks at the measured block time", () => {
    // 2s blocks: a week is 302,400 of them.
    expect(windowStartBlock(probe(1_000_000n, 2))).toBe(1_000_000n - 302_400n);
    // 12s blocks: a sixth as many.
    expect(windowStartBlock(probe(1_000_000n, 12))).toBe(1_000_000n - 50_400n);
  });

  it("has no answer on a chain younger than the window", () => {
    // 12s blocks, but only 1,000 blocks of history: a week ago is before
    // genesis, and genesis is not a week ago.
    expect(windowStartBlock(probe(1_000n, 12, 900n))).toBeUndefined();
  });

  // Both are shapes a node can actually return: a reorg-adjacent head, or a
  // chain whose timestamps do not advance between two blocks.
  it("has no answer from a probe that says nothing", () => {
    expect(windowStartBlock(probe(1_000_000n, 0))).toBeUndefined();
    expect(
      windowStartBlock({
        headNumber: 100n,
        headSeconds: 1_000,
        probeNumber: 100n,
        probeSeconds: 1_000,
      }),
    ).toBeUndefined();
  });

  it("keeps the window it names in the UI", () => {
    expect(WINDOW_SECONDS).toBe(7 * 24 * 60 * 60);
  });
});
