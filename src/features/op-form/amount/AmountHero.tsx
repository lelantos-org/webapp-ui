import { type ReactNode, useId } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { assetUsd, usePrices } from "@/features/assets";
import { preloadProverWorker } from "@/features/wallet";
import { cx } from "@/shared/lib/cx";
import { formatUsd } from "@/shared/lib/format/money";
import { amountInWords } from "@/shared/lib/format/words";
import { type AmountValidation, type AssetMeta, pickAmountError } from "./amount-validation";
import "./AmountHero.css";
import { formatAmountForAsset } from "@/shared/lib/format/asset";

export interface AmountHeroProps {
  inputProps: UseFormRegisterReturn;
  /// Above the figure: "You send", "You shield", "You pay".
  label: string;
  selected: AssetMeta | undefined;
  /// The raw field text; the words are written from the digits as typed.
  value: string;
  /// Circuit units, for the dollar figure; `undefined` while empty or mid-edit.
  amount?: bigint | undefined;
  /// The asset trigger on the figure's row.
  asset?: ReactNode;
  /// "Shielded", "In your wallet".
  balanceLabel?: string;
  /// The phone form of `balanceLabel`.
  balanceLabelShort?: string;
  /// Already formatted, since only the caller knows base units from circuit units.
  balance?: ReactNode;
  /// What Max writes, in circuit units; no button when `undefined`.
  maxAmount: bigint | undefined;
  onSetMax(formatted: string): void;
  /// Beside Max: why it is lower than the balance.
  maxInfo?: ReactNode;
  validation: AmountValidation;
  formError?: string | undefined;
  hint?: ReactNode;
  size?: "lg" | "md";
  /// Symbol the words end in; defaults to the selected asset's.
  wordsSymbol?: string | undefined;
}

/// The amount, twice: a large bare input with the asset trigger, the figure in words, and a balance row with Max.
export function AmountHero({
  inputProps,
  label,
  selected,
  value,
  amount,
  asset,
  balanceLabel,
  balanceLabelShort,
  balance,
  maxAmount,
  onSetMax,
  maxInfo,
  validation,
  formError,
  hint,
  size = "lg",
  wordsSymbol,
}: AmountHeroProps) {
  const id = useId();
  const wordsId = `${id}-words`;
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;

  const prices = usePrices();
  const usd =
    selected && amount !== undefined && amount > 0n
      ? assetUsd(amount, selected, prices)
      : undefined;

  const error = pickAmountError(formError, validation);
  const words = amountInWords(value, wordsSymbol ?? selected?.symbol ?? "");
  const describedBy = cx(words && wordsId, error && errId, hint ? hintId : undefined) || undefined;
  const canMax = maxAmount !== undefined && selected;

  return (
    <div className={cx("amt-hero", size === "md" && "amt-hero--md")}>
      <label className="amt-hero__lbl" htmlFor={id}>
        {label}
      </label>
      <div className="amt-hero__row">
        <input
          {...inputProps}
          id={id}
          className="figure amt-hero__inp"
          placeholder="0"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={() => void preloadProverWorker()}
        />
        {asset}
      </div>
      <div className="cheque amt-hero__words">
        <span className="cheque__txt amt-hero__words-txt" id={wordsId}>
          {words}
        </span>
        <span className="cheque__rule amt-hero__rule" aria-hidden="true" />
      </div>
      <div className="amt-hero__bal">
        <span className="amt-hero__usd">{usd === undefined ? null : `≈ ${formatUsd(usd)}`}</span>
        {balance !== undefined || canMax ? (
          <span className="amt-hero__have">
            {balance !== undefined ? (
              <BalanceFigure label={balanceLabel} short={balanceLabelShort} balance={balance} />
            ) : null}
            {canMax ? maxInfo : null}
            {canMax ? (
              <button
                type="button"
                className="amt-hero__max"
                onClick={() => onSetMax(formatAmountForAsset(maxAmount, selected))}
              >
                Max
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {error ? (
        <span className="amt-hero__err" id={errId}>
          {error}
        </span>
      ) : null}
      {hint ? (
        <span className="amt-hero__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function BalanceFigure({
  label,
  short,
  balance,
}: {
  label: string | undefined;
  short: string | undefined;
  balance: ReactNode;
}) {
  return (
    <span className="amt-hero__balance">
      {label ? (
        <>
          <span className={cx(short && "only-wide")}>{label}</span>
          {short ? <span className="only-narrow">{short}</span> : null}{" "}
        </>
      ) : null}
      <span className="amt-hero__figure">{balance}</span>
    </span>
  );
}
