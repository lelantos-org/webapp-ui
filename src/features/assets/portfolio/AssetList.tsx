import { memo, useCallback, useId, useState } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { usdValue } from "@/shared/domain/units";
import { useCollapseTransition } from "@/shared/hooks/use-collapse-transition";
import { cx } from "@/shared/lib/cx";
import { formatAmountForDisplay } from "@/shared/lib/format/asset";
import { formatUsd } from "@/shared/lib/format/money";
import { PANEL_COLLAPSE_MS } from "@/shared/lib/motion";
import { TokenIcon } from "@/shared/ui/icons/TokenIcon";
import type { AssetBalanceView } from "../balances/use-balances";
import { type PriceMap, priceOf } from "../prices/prices";
import { RateLabelView } from "../yield/RateLabelView";
import type { YieldGain, YieldGains } from "../yield/yield-gains";
import { earnedDetail, earnedLine } from "./asset-copy";
import "./AssetList.css";

export interface AssetListProps {
  rows: AssetBalanceView[];
  byId: ReadonlyMap<bigint, RegisteredAsset>;
  prices: PriceMap;
  /// Unrealised yield per asset. An asset with no entry does not earn.
  gains: YieldGains;
}

/// The shielded holdings as disclosure rows, one detail open at a time.
export function AssetList({ rows, byId, prices, gains }: AssetListProps) {
  const [open, setOpen] = useState<bigint | undefined>(undefined);
  const toggle = useCallback((id: bigint) => setOpen((o) => (o === id ? undefined : id)), []);

  return (
    <ul className="pf-list">
      {rows.map((r) => {
        const meta = byId.get(r.asset);
        return (
          <AssetRow
            key={r.asset.toString()}
            row={r}
            label={meta ? meta.symbol : `#${r.asset.toString()}`}
            meta={meta}
            price={priceOf(prices, meta?.token)}
            gain={gains.get(r.asset)}
            open={open === r.asset}
            onToggle={toggle}
          />
        );
      })}
    </ul>
  );
}

const AssetRow = memo(function AssetRow({
  row,
  label,
  meta,
  price,
  gain,
  open,
  onToggle,
}: {
  row: AssetBalanceView;
  label: string;
  meta: RegisteredAsset | undefined;
  /// USD per whole token; `undefined` when unpriced, shown as a dash.
  price: number | undefined;
  gain: YieldGain | undefined;
  open: boolean;
  onToggle(id: bigint): void;
}) {
  const detailId = useId();
  const { mounted, expanded } = useCollapseTransition(open, PANEL_COLLAPSE_MS);

  const fmt = (v: bigint) => (meta ? formatAmountForDisplay(v, meta) : v.toString());
  const total = row.balance + row.pending;
  const usd =
    meta && price !== undefined
      ? usdValue(total, meta.decimals, meta.scale, price, meta.index)
      : undefined;
  const earned = meta ? earnedLine(gain, meta, price) : undefined;

  // Render both legs: a swap has an incoming and an outgoing amount in flight at once.
  const settling = [
    row.outflow > 0n ? { dir: "out" as const, text: `−${fmt(row.outflow)}` } : undefined,
    row.pending > 0n ? { dir: "in" as const, text: `+${fmt(row.pending)}` } : undefined,
  ].filter((c): c is SettleLeg => c !== undefined);

  return (
    <li className={cx("pf-row", expanded && "pf-row--open")}>
      <button
        type="button"
        className="pf-row__btn"
        aria-expanded={open}
        aria-controls={mounted ? detailId : undefined}
        onClick={() => onToggle(row.asset)}
      >
        <TokenIcon symbol={label} address={meta?.token} className="pf-row__mark" />
        <span className="pf-row__left">
          <span className="pf-row__name">
            {label}
            {meta?.vaultName ? <span className="pf-row__vault"> · {meta.vaultName}</span> : null}
          </span>
          <span className="pf-row__bal mono">
            {settling.length > 0 ? (
              <span className="bal__flow">
                <span className="sr-only">settling</span>
                <span className="bal__spin" aria-hidden />
                {settling.map((c) => (
                  <span key={c.dir} className={`bal__delta bal__delta--${c.dir}`}>
                    {c.text}
                  </span>
                ))}
              </span>
            ) : null}
            {fmt(total)} {label}
          </span>
        </span>
        <span className="pf-row__right">
          {usd !== undefined ? (
            <span className="pf-row__usd mono">{formatUsd(usd)}</span>
          ) : (
            <span className="pf-row__usd pf-row__usd--none mono" title="No price for this asset">
              —<span className="sr-only">no price</span>
            </span>
          )}
          {earned ? (
            <span className={`pf-row__earned mono pf-row__earned--${earned.tone}`}>
              {earned.text}
            </span>
          ) : null}
        </span>
      </button>
      {mounted ? (
        <div
          className={cx("collapse", expanded && "collapse--open")}
          id={detailId}
          aria-hidden={!open || undefined}
        >
          <div className="collapse__inner">
            <AssetDetail label={label} meta={meta} gain={gain} />
          </div>
        </div>
      ) : null}
    </li>
  );
});

function AssetDetail({
  label,
  meta,
  gain,
}: {
  label: string;
  meta: RegisteredAsset | undefined;
  gain: YieldGain | undefined;
}) {
  return (
    <div className="pf-detail">
      <div className="pf-detail__body">
        {meta?.yieldEnabled ? (
          <YieldFigures meta={meta} gain={gain} />
        ) : (
          <PlainCustody label={label} />
        )}
      </div>
    </div>
  );
}

function YieldFigures({ meta, gain }: { meta: RegisteredAsset; gain: YieldGain | undefined }) {
  const earned = earnedDetail(gain, meta.decimals);
  return (
    <dl className="pf-detail__stats">
      <div className="pf-detail__stat">
        <dt className="pf-detail__lbl">You&rsquo;ve earned</dt>
        <dd className="pf-detail__fig">
          {earned.amount !== undefined ? (
            <>
              <span
                className={cx(
                  "pf-detail__num mono pf-detail__num--earned",
                  earned.down && "pf-detail__num--down",
                )}
              >
                {earned.amount}
              </span>
              <span className="pf-detail__pct mono"> {earned.percent}</span>
              {earned.partial ? (
                <span className="pf-detail__note">
                  At least this much: some notes predate the recorded history.
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="pf-detail__num mono">—</span>
              <span className="pf-detail__note">
                No recorded history reaches back to these notes, so this can't be worked out.
              </span>
            </>
          )}
        </dd>
      </div>
      <div className="pf-detail__stat">
        <dt className="pf-detail__lbl">Pool pays</dt>
        <dd className="pf-detail__fig">
          <RateLabelView asset={meta} variant="detail" />
        </dd>
      </div>
    </dl>
  );
}

function PlainCustody({ label }: { label: string }) {
  return (
    <p className="pf-detail__p">
      {label} does not earn. It is held in the pool as it is, so its balance changes only when you
      move it.
    </p>
  );
}

interface SettleLeg {
  dir: "in" | "out";
  text: string;
}
