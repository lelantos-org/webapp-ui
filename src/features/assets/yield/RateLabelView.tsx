import type { RegisteredAsset } from "@/config/chains";
import { cx } from "@/shared/lib/cx";
import { formatWindowShort, RATE_WORDS, type RateLabel, rateLabel } from "./rate-label";

export interface RateLabelViewProps {
  asset: RegisteredAsset;
  /// `detail`: portfolio row; `compact`: empty-wallet list; `picker`: "Choose an asset".
  variant: "detail" | "compact" | "picker";
}

export function RateLabelView({ asset, variant }: RateLabelViewProps) {
  const label = rateLabel(asset);
  switch (variant) {
    case "detail":
      return <DetailRate label={label} />;
    case "compact":
      return <CompactRate label={label} asset={asset} />;
    case "picker":
      return <PickerRate label={label} />;
  }
}

function figureOf(label: RateLabel): { fig: string; note: string; paused: boolean } | undefined {
  if (label.kind === "rate") return { fig: label.rate, note: label.window, paused: false };
  if (label.kind === "paused")
    return { fig: RATE_WORDS.paused, note: RATE_WORDS.backed, paused: true };
  return undefined;
}

/// Yield assets only: the portfolio words plain custody itself.
function DetailRate({ label }: { label: RateLabel }) {
  const { fig, note, paused } = figureOf(label) ?? {
    fig: "—",
    note: "not measurable yet",
    paused: false,
  };
  return (
    <>
      <span className={cx("pf-detail__num mono", paused && "pf-detail__num--paused")}>{fig}</span>
      <span className="pf-detail__note">{note}</span>
    </>
  );
}

function CompactRate({ label, asset }: { label: RateLabel; asset: RegisteredAsset }) {
  const f = figureOf(label);
  if (f) {
    const tail = f.paused
      ? "still backed"
      : asset.apy
        ? formatWindowShort(asset.apy.windowDays)
        : "";
    return (
      <span className="pf-empty__rate">
        <span className={cx("mono pf-empty__rate-fig", f.paused && "pf-empty__rate-fig--paused")}>
          {f.fig}
        </span>
        <span className="pf-empty__rate-win"> · {tail}</span>
      </span>
    );
  }
  return label.kind === "unmeasured" ? (
    <span className="pf-empty__rate pf-empty__rate--none" title="Rate not measurable yet">
      —
    </span>
  ) : (
    <span className="pf-empty__rate pf-empty__rate--none">{RATE_WORDS.plain}</span>
  );
}

function PickerRate({ label }: { label: RateLabel }) {
  const f = figureOf(label);
  if (f) {
    return (
      <span className="apick__rate">
        <span className={cx("apick__rate-v", f.paused && "apick__rate-v--paused", "mono")}>
          {f.fig}
        </span>
        <span className="apick__rate-w">{f.note}</span>
      </span>
    );
  }
  return label.kind === "unmeasured" ? (
    <span className="apick__rate apick__rate--none">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{RATE_WORDS.unmeasured}</span>
    </span>
  ) : (
    <span className="apick__rate apick__rate--none">{RATE_WORDS.plain}</span>
  );
}
