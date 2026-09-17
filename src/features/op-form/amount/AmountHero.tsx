// "The amount, twice": the figure as typed, set large, and the same figure in
// words underneath, closed by a rule.
//
// Cheques have done this for a century against the decimal-point slip, which is
// the characteristic catastrophic error on a money screen too — `250` and `2500`
// differ by a glyph, "Two hundred fifty" and "Two thousand five hundred" do not.
// The trailing rule is the cheque's line through the rest of the box: there is
// nowhere to append anything after the words.
//
// Presentation only. Parsing, validation, the max ceiling and follow-max stay
// with the form (`parseAmountSafe`, `validateAmount`, `useFollowMax`); nothing
// here decides what is valid.

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
  /// The raw field text, for the words line. The words are written from the
  /// digits as typed — "1.500" is "500/1000" — so they take the string, not the
  /// parsed amount.
  value: string;
  /// The typed amount in circuit units, for the dollar figure. `undefined` while
  /// empty or mid-edit, which shows no dollar figure rather than a stale one.
  amount?: bigint | undefined;
  /// The asset trigger, on the figure's row. A button that opens the area's own
  /// picker; `AssetPill` is the shared look.
  asset?: ReactNode;
  /// What the balance on the right is: "Shielded", "In your wallet".
  balanceLabel?: string;
  /// The phone form of `balanceLabel`: "Wallet".
  balanceLabelShort?: string;
  /// The balance itself, already formatted — "8,420.00 USDC". Formatted by the
  /// caller because a deposit's source balance is base units and a spend's is
  /// circuit units, and only the caller knows which.
  balance?: ReactNode;
  /// What "Max" writes, in circuit units; the button is withheld when
  /// `undefined`. Not necessarily the balance — see `useSpendableMax`.
  maxAmount: bigint | undefined;
  onSetMax(formatted: string): void;
  /// Beside Max: why it is lower than the balance, when that needs saying.
  maxInfo?: ReactNode;
  validation: AmountValidation;
  formError?: string | undefined;
  /// A quiet line under the balance row, for anything else the amount needs.
  hint?: ReactNode;
  /// `lg` is 46px (Shield, Send, Unshield); `md` is 40px (Swap's two legs, Send
  /// by link). Both step down to 36px on phones.
  size?: "lg" | "md";
  /// Symbol the words end in. Defaults to the selected asset's.
  wordsSymbol?: string | undefined;
}

/// Large bare amount input, the asset trigger, the amount in words, and a
/// balance row with Max.
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
  // Never `$0.00` for an unknown: no asset, no price, or nothing typed.
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
          // Backstop for the tile-hover warm on Home: a deep link or a keyboard
          // reaches this field without hovering anything. Idempotent.
          onFocus={() => void preloadProverWorker()}
        />
        {asset}
      </div>
      {/* Rendered even when empty, so the row does not appear under the cursor
          on the first keystroke. */}
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

/// "Shielded 8,420.00 USDC", with the phone's shorter label where there is one.
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
