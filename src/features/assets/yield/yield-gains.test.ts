import { RAY } from "@lelantos-org/sdk/protocol";
import { describe, expect, it } from "vitest";
import type { RegisteredAsset } from "@/config/chains";
import { makeAsset } from "@/test/fixtures/assets";
import { computeGains, growthOf, type IndexAt, type YieldGain } from "./yield-gains";

function yieldAsset(id: bigint, index: bigint, scale = 1n): RegisteredAsset {
  return makeAsset(id, `T${id}`, { token: "0xAAAA", scale, index, yieldEnabled: true });
}

function plainAsset(id: bigint): RegisteredAsset {
  return { ...yieldAsset(id, RAY), yieldEnabled: false };
}

const note = (asset: bigint, value: bigint, firstSeenBlock?: number) => ({
  asset,
  value,
  firstSeenBlock,
});

function flat(index: bigint): IndexAt {
  return () => index;
}

const none: IndexAt = () => undefined;

const pct = (n: number) => Number((n * 100).toFixed(6));

describe("computeGains", () => {
  it("prices the gain as the difference between two conversions", () => {
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
    const got = computeGains(
      [note(1n, 1n, 10)],
      [yieldAsset(1n, (RAY * 110n) / 100n, 10n ** 10n)],
      flat(RAY),
    );
    expect(got.get(1n)?.gain).toBe(10n ** 9n);
  });
});
