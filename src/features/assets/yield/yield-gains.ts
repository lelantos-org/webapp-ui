import { circuitAmount } from "@lelantos-org/sdk";
import { toTokenUnits } from "@lelantos-org/sdk/protocol";
import type { RegisteredAsset } from "@/config/chains";

/// One asset's unrealised yield on the notes held now, in the token's base units.
export interface YieldGain {
  /// Gain over basis. Negative after a venue loss, never clamped.
  gain: bigint;
  /// What the counted notes were worth when received; the percentage's denominator.
  basis: bigint;
  /// Notes counted in `gain`. Zero means unknown, not `+0`.
  resolvedNotes: number;
  /// Notes with no resolvable basis, left out of the sums. Non-zero means the figure is partial.
  unknownNotes: number;
}

export type YieldGains = ReadonlyMap<bigint, YieldGain>;

/// Shared empty result, stable without a `useMemo`.
export const NO_GAINS: YieldGains = new Map();

/// `gain / basis`, for display. Zero on a zero basis rather than `NaN`.
export function growthOf(gain: YieldGain): number {
  return gain.basis === 0n ? 0 : Number(gain.gain) / Number(gain.basis);
}

/// The index at a past block, or `undefined` when it could not be resolved.
export type IndexAt = (asset: bigint, block: number) => bigint | undefined;

/// The note fields a basis is computed from. A `WalletNote` satisfies it.
export interface BasisNote {
  asset: bigint;
  value: bigint;
  firstSeenBlock?: number | undefined;
}

function earningAssets(assets: readonly RegisteredAsset[]): Map<bigint, RegisteredAsset> {
  return new Map(assets.filter((a) => a.yieldEnabled).map((a) => [a.id, a]));
}

/// Unrealised gain per asset. A note with no basis is left out of both sums, not counted flat.
export function computeGains(
  notes: readonly BasisNote[],
  assets: readonly RegisteredAsset[],
  indexAt: IndexAt,
): YieldGains {
  const byId = earningAssets(assets);
  const out = new Map<bigint, YieldGain>();

  for (const note of notes) {
    const asset = byId.get(note.asset);
    if (!asset) continue;
    const cur = out.get(note.asset) ?? { gain: 0n, basis: 0n, resolvedNotes: 0, unknownNotes: 0 };
    out.set(note.asset, cur);

    const then =
      note.firstSeenBlock === undefined ? undefined : indexAt(note.asset, note.firstSeenBlock);
    if (then === undefined) {
      cur.unknownNotes += 1;
      continue;
    }
    // Difference of two floored conversions, as the pool rounds, not a scaled index difference.
    const units = circuitAmount(note.value);
    const was = toTokenUnits(units, asset.scale, { index: then });
    cur.basis += was;
    cur.gain += toTokenUnits(units, asset.scale, { index: asset.index }) - was;
    cur.resolvedNotes += 1;
  }

  return out;
}
