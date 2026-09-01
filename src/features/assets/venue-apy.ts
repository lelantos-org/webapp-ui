// The venue's own rate, annualized — the arithmetic half.
//
// Nothing on the wire carries a rate. `/chains` publishes `index` and the pool's
// `yieldState` returns no APR and no timestamp, so a rate has to be measured:
// two samples of the same asset's index, far enough apart to say something, and
// the seconds between them. `use-venue-apy.ts` takes the samples; this module
// only turns a pair into a number.
//
// What this figure is, and the thing it must never be mistaken for:
//
//   - **The venue's rate, not the wallet's return.** A deposit made today into a
//     venue that ran at 4% all year has earned nothing, and the wallet's own
//     figure is the `earned` column. This one describes the asset, is the same
//     for every holder, and is the closest thing to forward-looking the pool
//     exposes.
//   - **Backward-looking all the same.** It is what the venue did over the
//     window, annualized on the assumption it keeps doing it. Venues do not
//     promise that, which is why the window is stated wherever the figure is.

/// Seconds in a year, for the exponent. 365 days: the pool has no calendar and
/// no leap-year notion, so a fixed year is the honest denominator.
export const YEAR_SECONDS = 365 * 24 * 60 * 60;

/// The shortest window worth annualizing.
///
/// A rate is `growth ^ (year / window)`, so a short window multiplies whatever
/// it caught — including a single lumpy accrual — by a huge exponent. Under this
/// the samples are dropped rather than dressed up as a rate: an hour of drift
/// annualizes to hundreds of percent and looks like a yield, not like noise.
export const MIN_WINDOW_SECONDS = 2 * 24 * 60 * 60;

/// Above this the samples are treated as garbage rather than as a rate.
///
/// A venue paying 10,000% is not a venue; it is a reindexed pool, a rebased
/// venue, or a window that straddled one. Printing that number would be the
/// most confident thing on the card and the only wrong one.
export const MAX_APY = 100;

/// How far back the older sample is taken.
///
/// A week: long enough that one lumpy accrual does not become the rate, short
/// enough to still describe the venue as it is now rather than as it was last
/// quarter. Named here rather than beside the fetch because the UI says it out
/// loud — a rate with no window stated is not a claim anyone can check.
export const WINDOW_DAYS = 7;
export const WINDOW_SECONDS = WINDOW_DAYS * 24 * 60 * 60;

/// Two block headers, far enough apart to average a block time out of.
export interface BlockProbe {
  headNumber: bigint;
  headSeconds: number;
  probeNumber: bigint;
  probeSeconds: number;
}

/**
 * The block the window starts at, estimated from a probe's block time.
 *
 * An estimate, and only ever an estimate — the block it names then has its own
 * timestamp read, and that is what the rate is computed against. Being a few
 * blocks out costs nothing; the point is to land near a week ago without
 * assuming a block time this chain does not have.
 *
 * `undefined` when the probe says nothing usable: no blocks between the two
 * samples, a timestamp that did not advance, or a chain not yet a window old —
 * in which case there is no earlier block to compare against, and a rate
 * measured from genesis over two days is a rate the venue never offered.
 */
export function windowStartBlock(probe: BlockProbe): bigint | undefined {
  const blocks = probe.headNumber - probe.probeNumber;
  const seconds = probe.headSeconds - probe.probeSeconds;
  if (blocks <= 0n || seconds <= 0) return undefined;

  const back = BigInt(Math.round(WINDOW_SECONDS / (seconds / Number(blocks))));
  if (back <= 0n || probe.headNumber <= back) return undefined;
  return probe.headNumber - back;
}

/// One reading of an asset's yield index, and when it was taken.
export interface IndexSample {
  /// RAY-scaled, exactly as the pool reports it.
  index: bigint;
  /// Unix seconds — the timestamp of the block the index was read at, not the
  /// wall clock of the machine reading it.
  at: number;
}

/**
 * The venue's annualized rate between two index samples, as a fraction —
 * `0.0418` for 4.18%.
 *
 * `undefined` rather than a number whenever the pair cannot support one: too
 * short a window, a missing or zero basis sample, an index that went to zero, or
 * a result too large to be a rate. Every one of those renders as no badge
 * figure at all, which is the difference between "not measured" and "0%".
 *
 * A negative result is returned as it is. A venue can lose, and the row that
 * shows a loss in its `earned` cell should not show a positive rate beside it.
 */
export function annualize(now: IndexSample, then: IndexSample): number | undefined {
  const elapsed = now.at - then.at;
  if (!Number.isFinite(elapsed) || elapsed < MIN_WINDOW_SECONDS) return undefined;
  if (then.index <= 0n || now.index <= 0n) return undefined;

  // Divided as integers before touching a float. Both indices are RAY-scaled and
  // land far above `Number.MAX_SAFE_INTEGER`, so converting each to a `number`
  // first would round both operands before the ratio — the one place in this
  // calculation where a rounding survives into the answer.
  const SCALE = 1_000_000_000_000n;
  const ratio = Number((now.index * SCALE) / then.index) / Number(SCALE);
  if (!(ratio > 0)) return undefined;

  const apy = ratio ** (YEAR_SECONDS / elapsed) - 1;
  if (!Number.isFinite(apy) || apy > MAX_APY) return undefined;
  return apy;
}

/// Annualized venue rates by asset id, as fractions. An asset with no entry has
/// no measurable rate; see {@link annualize} for the several reasons why.
export type VenueApys = ReadonlyMap<bigint, number>;

/// Shared identity for "no rates known", so callers can return it without
/// minting a map and without a `useMemo` to keep it stable.
export const NO_APYS: VenueApys = new Map();

/// The rate as it goes on the badge: `4.18%`.
///
/// Two decimals at every size. A rate rounded to `4%` reads as a round number
/// somebody chose, and the difference between 4.18% and 4.49% is the whole
/// reason for showing a venue rate at all.
export function formatApy(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}
