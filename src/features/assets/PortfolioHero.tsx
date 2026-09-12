import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSyncProgress, useWalletState } from "@/features/wallet";
import { cx } from "@/shared/lib/cx";
import { formatUsd } from "@/shared/lib/format/money";
import { relativeTime } from "@/shared/lib/format/time";
import { plural } from "@/shared/lib/text";
import { ShieldGlyph } from "@/shared/ui/glyphs";
import { signOf } from "./asset-copy";
import { earnedTotal, portfolioTotal } from "./portfolio-total";
import { usePortfolio } from "./use-portfolio";
import "./PortfolioHero.css";

/// The shielded balance, at page scale, above everything else: "Shielded
/// balance", the figure, one line under it.
///
/// It is not a property of a card — it is the answer to the question the page
/// exists to answer, so it is rendered before any card and owns its own hooks
/// rather than being threaded down as props. The queries are shared with
/// `AssetsCard`, so mounting both costs one set of requests, not two.
///
/// Four states that must not look alike:
/// - **counting** — no figure at all, only a skeleton and the scan count. A
///   running total is deliberately not shown: the SDK settles spends after the
///   scan, so a partial sum can fall, and "at least $X" would be untrue.
/// - **nothing shielded** — finished, and the answer is zero: "$0.00", muted.
/// - **stale** — the last sync failed: the figure that was true then, with when
///   that was and a retry. Stale is not empty.
/// - **settled** — the figure, and what it earned.
export function PortfolioHero() {
  const { shielded, rows, byId, prices, gains } = usePortfolio();
  const total = useMemo(
    () => (rows ? portfolioTotal(rows, byId, prices) : undefined),
    [rows, byId, prices],
  );
  const earned = useMemo(() => earnedTotal(gains, byId, prices), [gains, byId, prices]);

  if (shielded.data === undefined || total === undefined) {
    return shielded.error ? <FailedFirstSync /> : <Counting />;
  }

  const { usd, priced, unpriced } = total;
  const empty = priced === 0 && unpriced === 0;
  const syncedAt = shielded.data.syncedAt;
  const figure = empty ? (
    "$0.00"
  ) : priced === 0 ? (
    "—"
  ) : (
    <UsdFigure usd={usd} approx={unpriced > 0} />
  );

  let sub: ReactNode;
  if (shielded.error) {
    sub = (
      <span className="pf-hero__stale">
        Last synced <SyncedAgo at={syncedAt} />. <RetryButton />
      </span>
    );
  } else if (empty) {
    sub = (
      <>
        Nothing shielded yet — synced <SyncedAgo at={syncedAt} />
      </>
    );
  } else {
    sub = (
      <>
        Private end to end
        {earned ? (
          <>
            {" · "}
            <span className={cx("pf-hero__earned mono", earned.usd < 0 && "pf-hero__earned--down")}>
              {signOf(earned.partial, earned.usd < 0)}
              {formatUsd(Math.abs(earned.usd))} earned
            </span>
          </>
        ) : null}
        {unpriced > 0 ? (
          <>
            {" · "}
            <span className="pf-hero__partial">
              {priced === 0
                ? `no price for ${plural(unpriced, "asset")}`
                : `excludes ${plural(unpriced, "unpriced asset")}`}
            </span>
          </>
        ) : null}
      </>
    );
  }

  return (
    <HeroShell muted={empty || priced === 0} figure={figure}>
      {sub}
    </HeroShell>
  );
}

function HeroShell({
  figure,
  muted = false,
  children,
}: {
  figure: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="pf-hero">
      <span className="pf-hero__label">
        <ShieldGlyph size={17} className="pf-hero__shield" />
        Shielded balance
      </span>
      <p className={cx("pf-hero__val", muted && "pf-hero__val--muted")}>{figure}</p>
      <p className="pf-hero__sub" aria-live="polite">
        {children}
      </p>
    </div>
  );
}

/// Dollars at full size and cents in the muted ink, both at the same size.
/// `≈` leads a total that leaves an unpriced asset out.
function UsdFigure({ usd, approx }: { usd: number; approx: boolean }) {
  const [dollars, cents] = splitUsd(formatUsd(usd));
  return (
    <>
      {approx ? (
        <span className="pf-hero__approx" aria-hidden>
          ≈
        </span>
      ) : null}
      {dollars}
      {cents ? <span className="pf-hero__cents">{cents}</span> : null}
    </>
  );
}

/// First sync still running: no figure, because there is none yet.
function Counting() {
  const { active, scanned, hits } = useSyncProgress();
  return (
    <div className="pf-hero" role="status" aria-busy="true">
      <span className="pf-hero__label">
        <ShieldGlyph size={17} className="pf-hero__shield" />
        Shielded balance
      </span>
      <span className="pf-hero__skel" aria-hidden>
        <span className="skel-bar pf-hero__skel-bar" />
        <span className="skel-bar pf-hero__skel-bar pf-hero__skel-bar--short" />
      </span>
      <p className="pf-hero__sub" aria-live="polite">
        Still adding up your balance
        {active && scanned > 0 ? (
          <span className="pf-hero__scan mono">
            {" · "}scanned {scanned.toLocaleString()} · found {hits.toLocaleString()}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/// The first sync failed, so there has never been a figure to keep.
function FailedFirstSync() {
  return (
    <HeroShell muted figure="—">
      <span className="pf-hero__stale">
        Couldn't add up your balance. <RetryButton />
      </span>
    </HeroShell>
  );
}

/// Its own component so only it subscribes to `isFetching`: the hero around it
/// must not re-render on every background poll's fetch flag.
function RetryButton() {
  const { refetch, isFetching } = useWalletState();
  return (
    <button
      type="button"
      className="btn btn--outline pf-hero__retry"
      disabled={isFetching}
      onClick={() => void refetch()}
    >
      {isFetching ? "Retrying…" : "Retry"}
    </button>
  );
}

/// Split a rendered USD figure into dollars and cents, so the cents can be set
/// in the muted ink and the magnitude reads first.
///
/// A string with no two-digit decimal tail, such as `formatUsd`'s `<$0.01`, is
/// returned whole rather than cut at an arbitrary dot.
function splitUsd(s: string): [dollars: string, cents: string] {
  const dot = s.lastIndexOf(".");
  if (dot < 0 || s.length - dot !== 3) return [s, ""];
  return [s.slice(0, dot), s.slice(dot)];
}

/// "2 minutes ago", kept current.
///
/// Owns its own tick, so the 10s refresh re-renders this span alone rather than
/// the hero or the list around it. Mounted only where a `syncedAt` is shown, so
/// the timer stops with it.
export function SyncedAgo({ at }: { at: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  return <>{relativeTime(at)}</>;
}
