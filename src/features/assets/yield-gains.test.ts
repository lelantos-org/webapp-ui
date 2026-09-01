import { RAY } from "@lelantos-org/sdk";
import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { computeGains, growthOf, type IndexAt, type YieldGain } from "./yield-gains";

/// A yield asset at `index`. `scale` is 1 so the arithmetic under test is the
/// index conversion alone; the scale leg is exercised once, at the end.
function yieldAsset(id: bigint, index: bigint, scale = 1n): RegisteredAsset {
  return {
    id,
    token: "0xAAAA" as RegisteredAsset["token"],
    isWeth: false,
    symbol: `T${id}`,
    decimals: 18,
    scale,
    index,
    yieldEnabled: true,
    yieldHalted: false,
  };
}

function plainAsset(id: bigint): RegisteredAsset {
  return { ...yieldAsset(id, RAY), yieldEnabled: false };
}

const note = (asset: bigint, value: bigint, firstSeenBlock?: number) => ({
  asset,
  value,
  firstSeenBlock,
});

/// Every block resolves to `index`, whatever it is asked for.
function flat(index: bigint): IndexAt {
  return () => index;
}

/// Nothing resolves — an RPC with no archive state.
const none: IndexAt = () => undefined;

const pct = (n: number) => Number((n * 100).toFixed(6));

describe("computeGains", () => {
  it("prices the gain as the difference between two conversions", () => {
    // 100 units bought at 1.00, now worth 1.10.
    const got = computeGains(
      [note(1n, 100n, 10)],
      [yieldAsset(1n, (RAY * 110n) / 100n)],
      flat(RAY),
    );
    expect(got.get(1n)).toEqual({
      gain: 10n,
      basis: 100n,
      resolvedNotes: 1,
      unknownNotes: 0,
    });
  });

  it("reports a loss rather than clamping it", () => {
    const got = computeGains([note(1n, 100n, 10)], [yieldAsset(1n, (RAY * 90n) / 100n)], flat(RAY));
    expect(got.get(1n)?.gain).toBe(-10n);
    expect(pct(growthOf(got.get(1n) as YieldGain))).toBe(-10);
  });

  it("weights notes by value, not by count", () => {
    // 900 units bought at 1.00 and 100 at 2.00; the index is now 2.00, so only
    // the first has gained. A count-weighted average would report +25%.
    const indexAt: IndexAt = (_asset, block) => (block === 1 ? RAY : RAY * 2n);
    const got = computeGains(
      [note(1n, 900n, 1), note(1n, 100n, 2)],
      [yieldAsset(1n, RAY * 2n)],
      indexAt,
    );
    expect(got.get(1n)?.gain).toBe(900n);
    expect(pct(growthOf(got.get(1n) as YieldGain))).toBe(81.818182);
  });

  it("excludes an unresolved note from both sums rather than counting it flat", () => {
    // One note resolves at 1.00 against an index of 1.10; the other has no
    // block at all. Folding the second in at the current index would halve the
    // reported return to +5%.
    const got = computeGains(
      [note(1n, 100n, 10), note(1n, 100n)],
      [yieldAsset(1n, (RAY * 110n) / 100n)],
      flat(RAY),
    );
    expect(got.get(1n)).toEqual({
      gain: 10n,
      basis: 100n,
      resolvedNotes: 1,
      unknownNotes: 1,
    });
  });

  it("reports nothing resolved rather than a zero gain", () => {
    // The caller renders this as unknown. A `gain` of 0 with `resolvedNotes: 0`
    // is the whole point: +0 would be a claim, and there is nothing to claim.
    const got = computeGains([note(1n, 100n, 10)], [yieldAsset(1n, RAY * 2n)], none);
    expect(got.get(1n)).toEqual({
      gain: 0n,
      basis: 0n,
      resolvedNotes: 0,
      unknownNotes: 1,
    });
  });

  it("skips assets that do not earn", () => {
    const got = computeGains([note(2n, 100n, 10)], [plainAsset(2n)], flat(RAY));
    expect(got.has(2n)).toBe(false);
  });

  it("returns +0 for a bound venue that has not moved", () => {
    const got = computeGains([note(1n, 100n, 10)], [yieldAsset(1n, RAY)], flat(RAY));
    expect(got.get(1n)).toEqual({ gain: 0n, basis: 100n, resolvedNotes: 1, unknownNotes: 0 });
  });

  it("carries the asset's scale into the base-unit figure", () => {
    // 1 circuit unit at scale 1e10 is 1e10 base units; up 10% is 1e9.
    const got = computeGains(
      [note(1n, 1n, 10)],
      [yieldAsset(1n, (RAY * 110n) / 100n, 10n ** 10n)],
      flat(RAY),
    );
    expect(got.get(1n)?.gain).toBe(10n ** 9n);
  });
});
