// "Choose an asset" — the Shield screen's asset picker.
//
// A screen of its own rather than a `<select>`, because this is the decision
// moment the registry's rates are for: every asset the pool accepts, what the
// user already holds of each in their public wallet, and what each venue pays.
// A native option can carry none of that, which is why the spends keep
// `AssetSelectPill` and this serves Shield alone. The rules the rows keep are in
// `shield-asset-options.ts` and `rate-label.ts`.
//
// It takes the form's place — the caller hides the form and renders this —
// so the fields keep their state, and back returns to exactly what was entered.

import { useEffect, useMemo, useRef } from "react";
import { useActiveChain } from "@/features/chain";
import { useEscapeKey } from "@/shared/hooks/use-escape-key";
import { cx } from "@/shared/lib/cx";
import { formatFixed } from "@/shared/lib/format/number";
import { CheckGlyph } from "@/shared/ui/icons/glyphs";
import { TokenIcon } from "@/shared/ui/icons/TokenIcon";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { useDepositSourceBalances } from "../balances/transparent-balances";
import { useRegisteredAssets } from "../registry/registered-assets";
import { RateLabelView } from "../yield/RateLabelView";
import { heldFirst, shieldOptions } from "./shield-asset-options";
import "./ShieldAssetPicker.css";

export interface ShieldAssetPickerProps {
  /// The current picker value: `ethOption(id)` or an asset id string.
  value: string;
  /// Called with the chosen value. The picker does not close itself; the caller
  /// closes it, so it can return focus to the control that opened it.
  onChange(value: string): void;
  onClose(): void;
}

export function ShieldAssetPicker({ value, onChange, onClose }: ShieldAssetPickerProps) {
  const assets = useRegisteredAssets();
  const chain = useActiveChain();
  const options = useMemo(
    () => shieldOptions(assets, chain.nativeAdapterAddress !== undefined),
    [assets, chain.nativeAdapterAddress],
  );
  const refs = useMemo(
    () => options.map((o) => ({ assetId: o.asset.id, asEth: o.asEth })),
    [options],
  );
  // Mounted only while choosing, so the per-token reads happen only then.
  const balances = useDepositSourceBalances(refs);
  const balanceByValue = new Map(options.map((o, i) => [o.value, balances[i]]));
  const rows = heldFirst(options, (o) => balanceByValue.get(o.value));

  // Focus the chosen row on open, so a keyboard user starts where they are and
  // Escape is one key from leaving.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    (
      list?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      list?.querySelector<HTMLElement>("button")
    )?.focus();
  }, []);

  useEscapeKey(onClose);

  return (
    <section className="apick" aria-label="Choose an asset">
      <ScreenHeader
        title="Choose an asset"
        subtitle={`Everything the pool accepts on ${chain.chainName}`}
        onBack={onClose}
        backLabel="Back to Shield"
      />

      {rows.length === 0 ? (
        <p className="apick__empty">No assets are registered on {chain.chainName} yet.</p>
      ) : (
        <ul className="apick__list" ref={listRef}>
          {rows.map((o) => {
            const chosen = o.value === value;
            const balance = balanceByValue.get(o.value);
            return (
              <li key={o.value}>
                <button
                  type="button"
                  className={cx("apick__row", chosen && "apick__row--on")}
                  aria-pressed={chosen}
                  onClick={() => onChange(o.value)}
                >
                  <TokenIcon
                    symbol={o.symbol}
                    address={o.asEth ? undefined : o.asset.token}
                    className="apick__mark"
                  />
                  <span className="apick__name">
                    <span className="apick__sym">
                      {o.symbol}
                      {o.asset.vaultName ? (
                        <span className="apick__vault"> · {o.asset.vaultName}</span>
                      ) : null}
                    </span>
                    {balance === undefined ? null : balance > 0n ? (
                      <span className="apick__have mono">
                        You hold {formatFixed(balance, o.decimals, 2, 4)}
                      </span>
                    ) : (
                      <span className="apick__have">Not held yet</span>
                    )}
                  </span>
                  <RateLabelView asset={o.asset} variant="picker" />
                  <span className="apick__check" aria-hidden="true">
                    {chosen ? <CheckGlyph size={11} strokeWidth={3.2} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="inset apick__foot">
        <p className="apick__foot-lead">
          A rate is what that venue returned over the window shown, net of the pool&rsquo;s cut. It
          is an estimate of what it pays — not a promise, and not what you will earn, which depends
          on when you arrive.
        </p>
        <p>
          A dash means the rate cannot be measured, which is not the same as earning nothing. The
          order here is the registry&rsquo;s own — nothing on this screen is ranked or recommended.
        </p>
      </div>
    </section>
  );
}
