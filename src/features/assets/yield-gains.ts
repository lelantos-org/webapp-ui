// What a yield asset has earned *for this wallet*, as opposed to what its venue
// has earned since it was bound — the arithmetic half.
//
// The pool publishes one number, `index`, and it is not the user's return: it is
// the venue's growth since the binding was created. A deposit made today into a
// venue up 8% has earned nothing, and reporting 8% against it would be a claim
// about someone else's position. The user's own return needs a cost basis, and
// nothing on the wire carries one — `asset_yield` on the indexer is keyed by
// asset and overwritten every poll, so there is no history to read a past index
// out of.
//
// What does exist is per-note: a note's circuit-unit `value` never moves, and
// `firstSeenBlock` says which block it was credited at. So the basis is
// recoverable by asking the pool what the index *was* at that block. Recovering
// it is `yield-index.ts`'s job; this module only folds the answers into gains.
//
// Two things this figure is not, both of which the UI has to say out loud:
//
//   - **Not lifetime earnings.** Spending a note realises its gain and mints
//     change at today's index, which resets that portion's basis. This is the
//     unrealised gain on the notes held right now.
//   - **Not always knowable.** Historical `eth_call` needs archive state, which
//     plenty of RPCs prune. A block that cannot be answered leaves its notes out
//     of the sum and is counted in `unknownNotes`, so the caller can mark the
//     figure partial rather than print a confident understatement.

import { circuitAmount, toTokenUnits } from "@lelantos-org/sdk/core";
import type { RegisteredAsset } from "./registered-assets";

/// One asset's unrealised yield, in the token's own base units.
export interface YieldGain {
  /// Gain over basis, in base units. Negative after a venue loss, which is a
  /// real outcome and is shown rather than clamped.
  gain: bigint;
  /// What the counted notes were worth when they were received, in base units.
  /// The denominator for a percentage; kept exact rather than pre-divided so
  /// nothing in this layer is lossy.
  basis: bigint;
  /// Notes whose basis resolved, and so are counted in `gain`. Zero means the
  /// figure rests on nothing and must be rendered as unknown, not as `+0`.
  resolvedNotes: number;
  /// Notes excluded from the sum because their basis could not be resolved — no
  /// `firstSeenBlock`, or an RPC with no state at that block. Non-zero means the
  /// figure understates and must be marked partial.
  unknownNotes: number;
}

export type YieldGains = ReadonlyMap<bigint, YieldGain>;

/// Shared identity for "nothing earns here", so callers can return it without
/// minting a map and without a `useMemo` to keep it stable.
export const NO_GAINS: YieldGains = new Map();

/// `gain / basis`, for display. Zero on a zero basis rather than `NaN`.
export function growthOf(gain: YieldGain): number {
  return gain.basis === 0n ? 0 : Number(gain.gain) / Number(gain.basis);
}

/// The index at a past block, or `undefined` when it could not be resolved.
export type IndexAt = (asset: bigint, block: number) => bigint | undefined;

/// The note fields a basis is computed from.
///
/// Plain `bigint`s rather than `WalletNote`'s branded ones: nothing here spends
/// or proves, so the brands buy no safety and would make every caller — the
/// tests included — mint them for no reason. A `WalletNote` satisfies this.
export interface BasisNote {
  asset: bigint;
  value: bigint;
  firstSeenBlock?: number | undefined;
}

/// The assets that earn, indexed by id. One predicate, so "which assets have a
/// basis worth resolving" and "which assets get a row" can never disagree.
export function earningAssets(assets: readonly RegisteredAsset[]): Map<bigint, RegisteredAsset> {
  return new Map(assets.filter((a) => a.yieldEnabled).map((a) => [a.id, a]));
}

/**
 * Unrealised gain per asset, from a resolved basis.
 *
 * Pure, and split out from the resolution that feeds it: this is the part with
 * arithmetic worth testing, and it has no opinion about where an index came
 * from.
 *
 * A note whose basis index is unknown is excluded from *both* sums rather than
 * counted at the current index. Counting it would fold a zero gain into the
 * average and pull the percentage toward zero, which reads as a real return
 * rather than as missing data.
 */
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
    // Base units either side, differenced — rather than the difference of the
    // indices scaled once. `toTokenUnits` floors, exactly as the pool's own
    // conversion does, so the gain is the difference between two figures the
    // user could actually have seen, not a residue of the rounding between them.
    const units = circuitAmount(note.value);
    const was = toTokenUnits(units, asset.scale, { index: then });
    cur.basis += was;
    cur.gain += toTokenUnits(units, asset.scale, { index: asset.index }) - was;
    cur.resolvedNotes += 1;
  }

  return out;
}
