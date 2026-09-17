import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSyncProgress, useWalletState } from "@/features/wallet";
import { cx } from "@/shared/lib/cx";
import { formatUsd } from "@/shared/lib/format/money";
import { plural } from "@/shared/lib/format/text";
import { relativeTime } from "@/shared/lib/format/time";
import { ShieldGlyph } from "@/shared/ui/icons/shield";
import { signOf } from "./asset-copy";
import { earnedTotal, portfolioTotal } from "./portfolio-total";
import { usePortfolio } from "./use-portfolio";
import "./PortfolioHero.css";

/// The shielded balance at page scale. Shows no running total while counting: spends settle
/// after the scan, so a partial sum could fall.
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
      <HeroLabel />
      <p className={cx("pf-hero__val", muted && "pf-hero__val--muted")}>{figure}</p>
      <p className="pf-hero__sub" aria-live="polite">
        {children}
      </p>
    </div>
  );
}

function HeroLabel() {
  return (
    <span className="pf-hero__label">
      <ShieldGlyph size={17} className="pf-hero__shield" />
      Shielded balance
    </span>
  );
}

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

function Counting() {
  const { active, scanned, hits } = useSyncProgress();
  return (
    <div className="pf-hero" role="status" aria-busy="true">
      <HeroLabel />
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

function FailedFirstSync() {
  return (
    <HeroShell muted figure="—">
      <span className="pf-hero__stale">
        Couldn't add up your balance. <RetryButton />
      </span>
    </HeroShell>
  );
}

/// Its own component so only it subscribes to `isFetching`, not the whole hero.
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

/// Split a formatted USD figure into dollars and cents; returned whole without a two-digit tail.
function splitUsd(s: string): [dollars: string, cents: string] {
  const dot = s.lastIndexOf(".");
  if (dot < 0 || s.length - dot !== 3) return [s, ""];
  return [s.slice(0, dot), s.slice(dot)];
}

function SyncedAgo({ at }: { at: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  return <>{relativeTime(at)}</>;
}
