// The shielded balance table, split out of `AssetsCard`.

import { memo } from "react";
import { Link } from "react-router-dom";
import { TokenIcon } from "@/features/icons";
import { type PriceMap, priceOf } from "@/features/prices";
import {
  DISPLAY_FRAC_DIGITS,
  formatAmountForDisplay,
  formatDecimalCompact,
  formatUsd,
  usdValue,
} from "@/shared/lib/format";
import type { RegisteredAsset } from "./registered-assets";
import type { AssetBalanceView } from "./use-balances";
import { formatApy, type VenueApys, WINDOW_DAYS } from "./venue-apy";
import { growthOf, type YieldGain, type YieldGains } from "./yield-gains";

export function ShieldedTable({
  rows,
  byId,
  prices,
  gains,
  apys,
}: {
  rows: AssetBalanceView[];
  byId: ReadonlyMap<bigint, RegisteredAsset>;
  prices: PriceMap;
  /// Unrealised yield per asset. An asset with no entry does not earn; see
  /// `EarnedCell` for why that is not the same as an entry of zero.
  gains: YieldGains;
  /// The venue's own annualized rate per asset, as a fraction. An asset with no
  /// entry has no measurable rate — a different thing from a rate of zero, and
  /// rendered as no figure rather than as `0.00%`.
  apys: VenueApys;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon" aria-hidden>
          ⌬
        </div>
        <div className="empty__title">no shielded notes yet</div>
        <p className="empty__sub">
          deposit to mint your first shielded note. balances stay private end-to-end.
        </p>
        {/* `/` is the deposit tab: a no-op from the deposit route itself, and a
            navigation from any other. */}
        <Link to="/" className="btn">
          deposit
        </Link>
      </div>
    );
  }
  // Which markers the `earned` column actually put on screen. The per-cell
  // explanation lives in a `title`, so on touch it does not exist at all, and
  // the legend below is where it goes instead.
  //
  // A flag per marker rather than one "something is off" flag: the states print
  // different glyphs, and a legend naming `≥` while every affected row shows a
  // dash explains a symbol the reader cannot find.
  const marks = { unknown: false, partial: false, rate: false };
  for (const r of rows) {
    const meta = byId.get(r.asset);
    if (!meta?.yieldEnabled) continue;
    if (apys.has(r.asset)) marks.rate = true;
    const gain = gains.get(r.asset);
    if (gain === undefined || gain.resolvedNotes === 0) marks.unknown = true;
    else if (gain.unknownNotes > 0) marks.partial = true;
  }

  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl tbl--pf">
          <thead>
            <tr>
              <th>asset</th>
              <th className="tbl__grp-a">balance</th>
              {/* Dropped on phones along with the glyph mark: four columns of
                  figures do not fit that width, and the row's `earning` badge
                  still says the asset yields. */}
              {/* Two adjacent figures with nothing stated between them read as
                  summable — a reading that sends users to the withdraw form
                  asking for balance plus earnings and getting "exceeds available
                  balance" for it. So the relation is put where it cannot be
                  missed or scrolled away from: "of which" in the head names the
                  figure as a part of the column beside it, the arrow points back
                  at that column, and `.tbl__grp-*` fences the two together. Said
                  once in the head rather than once per row, and unlike the
                  `title` below it is on screen for touch too. */}
              <th
                className="tbl__earned tbl__grp-b"
                title="part of the balance beside it, not on top of it: the yield accrued on the notes you hold now — spending a note realises its gain and resets its basis"
              >
                <span className="tbl__tie" aria-hidden>
                  ↳
                </span>
                of which earned
              </th>
              <th>value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = byId.get(r.asset);
              return (
                <ShieldedRowView
                  key={r.asset.toString()}
                  row={r}
                  label={meta ? meta.symbol : `#${r.asset.toString()}`}
                  meta={meta}
                  price={priceOf(prices, meta?.token)}
                  gain={gains.get(r.asset)}
                  apy={apys.get(r.asset)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Outside `.tbl-wrap` on purpose: that box scrolls at its max height, and
          a note placed inside it is out of sight until the reader scrolls past
          the last row — past the very figures it explains. */}
      {marks.partial || marks.unknown || marks.rate ? (
        <dl className="tbl__legend txt-xs muted">
          {/* The two rows below key the `earned` column, which phones do not
              show; `--earned` is what lets them go with it while the rate key,
              whose badge is in the asset cell, stays. */}
          {marks.partial ? (
            <div className="tbl__legend-row tbl__legend-row--earned">
              <dt className="tbl__legend-key mono">≥</dt>
              <dd>
                at least this much: some of these notes have no resolvable historical basis, so the
                figure understates
              </dd>
            </div>
          ) : null}
          {marks.unknown ? (
            <div className="tbl__legend-row tbl__legend-row--earned">
              <dt className="tbl__legend-key mono">—</dt>
              <dd>unknown: no historical index reaches back to these notes</dd>
            </div>
          ) : null}
          {/* Two percentages are now on the card, and which is whose is the one
              thing a reader cannot work out from the figures themselves. The
              badge describes the asset and is the same for everyone holding it;
              the `earned` column is this wallet's. Said here because no amount
              of styling distinguishes a venue's rate from a personal return. */}
          {marks.rate ? (
            <div className="tbl__legend-row">
              <dt className="tbl__legend-key mono">%</dt>
              <dd>
                on the badge: what the venue itself returned over the last {WINDOW_DAYS} days,
                annualized — not a promise, and not your own return, which is the earned column
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </>
  );
}

/// One row per asset.
///
/// The figure is updated in place rather than keyed on its own value: keying on
/// the balance would remount the element on every change and replay its entrance
/// animation as a tx settled in stages.
///
/// Memoised. `row` identities are stable while the balances query is unchanged,
/// so an unrelated re-render of the card does not re-render the table.
const ShieldedRowView = memo(function ShieldedRowView({
  row,
  label,
  meta,
  price,
  gain,
  apy,
}: {
  row: AssetBalanceView;
  label: string;
  meta: RegisteredAsset | undefined;
  /// USD per whole token, or `undefined` when no price is known. Not zero: an
  /// unpriced asset shows no dollar line rather than `$0.00`.
  price: number | undefined;
  /// This asset's unrealised yield, or `undefined` when it has none to report.
  gain: YieldGain | undefined;
  /// The venue's annualized rate, or `undefined` when none could be measured.
  apy: number | undefined;
}) {
  // Capped for display; the figures behind it keep full precision.
  const fmt = (v: bigint) => (meta ? formatAmountForDisplay(v, meta) : v.toString());

  // Both directions are rendered. A single branch on `outflow` would hide an
  // incoming amount whenever something was also leaving, so a swap — which has
  // both legs in flight — would report only the debit.
  //
  // One element each rather than one holding both signed figures, so a debit and
  // a credit do not run together as a single expression.
  const settling: SettleLeg[] = [
    row.outflow > 0n ? { dir: "out" as const, text: `−${fmt(row.outflow)}` } : undefined,
    row.pending > 0n ? { dir: "in" as const, text: `+${fmt(row.pending)}` } : undefined,
  ].filter((c): c is SettleLeg => c !== undefined);

  const total = row.balance + row.pending;
  const usd =
    meta && price !== undefined
      ? usdValue(total, meta.decimals, meta.scale, price, meta.index)
      : undefined;

  return (
    <tr>
      <td>
        <span className="tok">
          {/* Seeded on the token address where there is one, so two rows sharing
              a symbol still get different marks. */}
          <TokenIcon symbol={label} address={meta?.token} />
          <span className="tok__sym mono">{label}</span>
          {/* A yield balance grows with no transaction behind it, so the row
              says why. `halted` still earns nothing and is still fully backed,
              which is a different thing from not being a yield asset at all —
              showing both as plain would misdescribe it. */}
          {meta?.yieldEnabled ? (
            <span
              className={`tok__yield${meta.yieldHalted ? " tok__yield--halted" : ""}`}
              title={
                meta.yieldHalted
                  ? "yield paused — balance still fully backed"
                  : apy !== undefined
                    ? `earning yield — the venue returned ${formatApy(apy)} a year over the last ${WINDOW_DAYS} days. The venue's rate, not your return: a note bought yesterday has earned a day of it.`
                    : "earning yield — balance grows without a transaction"
              }
            >
              {meta.yieldHalted ? "paused" : "earning"}
              {/* The rate rides on the badge rather than in a column of its own:
                  it describes the asset, not the holding, and the table is
                  already at four columns and drops one on a phone — where this
                  is arguably the figure most worth keeping. Absent, not zero,
                  when nothing could be measured; see `annualize`. */}
              {!meta.yieldHalted && apy !== undefined ? (
                <span className="tok__apy mono">{formatApy(apy)}</span>
              ) : null}
            </span>
          ) : null}
        </span>
      </td>
      <td className="tbl__grp-a">
        <span className="bal">
          {/* On the figure's own line rather than stacked beneath it. A second
              line would change the row's height as each leg appeared and
              settled, shifting the whole table, and a swap's two legs would wrap
              to a third line on a narrow screen. */}
          {settling.length > 0 ? (
            <span className="bal__flow">
              {/* The legs are amounts distinguished by colour and a spinner, so
                  the label is supplied for assistive technology. */}
              <span className="sr-only">settling</span>
              <span className="bal__spin" aria-hidden />
              {settling.map((c) => (
                <span key={c.dir} className={`bal__delta bal__delta--${c.dir}`}>
                  {c.text}
                </span>
              ))}
            </span>
          ) : null}
          <span className="bal__main mono">{fmt(total)}</span>
        </span>
      </td>
      <td className="tbl__earned tbl__grp-b">
        <EarnedCell gain={gain} meta={meta} />
      </td>
      {/* An unpriced asset gets a dash rather than a blank, so the column keeps
          its shape and the absence of a price is stated. */}
      <td>
        {usd !== undefined ? (
          <span className="bal__usd mono">{formatUsd(usd)}</span>
        ) : (
          <span className="bal__usd bal__usd--none" title="no price for this asset">
            —
          </span>
        )}
      </td>
    </tr>
  );
});

/**
 * The `earned` cell: what this wallet's current notes have accrued.
 *
 * Four states, and conflating any two of them would misreport something:
 *
 * - **plain custody** — blank. The asset does not earn, so there is nothing to
 *   say about it, and a dash here would claim the return is merely unknown.
 * - **earning, basis unresolved** — a dash. The wallet knows the asset yields
 *   but could not price what it held at the time it acquired it, because the
 *   node has no archive state that far back. Genuinely unknown.
 * - **earning, partial** — the figure, marked. Some notes resolved and some did
 *   not, so the amount is real but understates. Saying so is the difference
 *   between a low number and a wrong one.
 * - **earning, resolved** — the figure.
 *
 * Signed and shown in the token's own units rather than as a percentage alone:
 * the percentage is the return on the notes held, which is not the return on
 * everything the user has ever deposited into this asset, and a bare "+3.4%"
 * invites reading it as the latter. The amount is the honest half; the
 * percentage rides along as context.
 */
function EarnedCell({
  gain,
  meta,
}: {
  gain: YieldGain | undefined;
  meta: RegisteredAsset | undefined;
}) {
  if (!meta?.yieldEnabled) return null;
  if (gain === undefined || gain.resolvedNotes === 0) {
    return (
      <span className="earned earned--none" title="no historical index for these notes">
        {/* `title` is not exposed on a plain span and never appears on touch,
            so the same words go in a visually hidden node — the pattern this
            table already uses for the settling legs below. */}
        <span className="sr-only">earnings unknown: no historical index for these notes</span>
        <span aria-hidden>—</span>
      </span>
    );
  }

  // Both facts are read three and two times below; naming them once keeps the
  // sign, the tone and the marker from drifting apart.
  const down = gain.gain < 0n;
  const partial = gain.unknownNotes > 0;
  const explain = partial
    ? `at least this much, already counted in the balance: ${gain.unknownNotes} note(s) have no resolvable basis`
    : "already counted in the balance beside it";
  return (
    <span className={`earned${down ? " earned--down" : ""}`} title={explain}>
      {/* See above: `title` alone leaves the cell's only explanation of what
          this figure means unreachable without a mouse. */}
      <span className="sr-only">{explain}</span>
      <span className="mono">
        {partial ? "≥" : ""}
        {down ? "−" : "+"}
        {formatDecimalCompact(down ? -gain.gain : gain.gain, meta.decimals, DISPLAY_FRAC_DIGITS)}
      </span>
      <span className="earned__pct">{`${(growthOf(gain) * 100).toFixed(2)}%`}</span>
    </span>
  );
}

/// One in-flight leg of a row's balance.
interface SettleLeg {
  dir: "in" | "out";
  text: string;
}
