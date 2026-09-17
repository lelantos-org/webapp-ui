import type { ReactNode } from "react";
import type { AmountValidation } from "@/features/op-form";
import type { AssetUnits } from "@/shared/domain/units";
import { formatAmountForDisplay } from "@/shared/lib/format/asset";
import { formatFixed } from "@/shared/lib/format/number";

/// The line under the CTA: what the shield will ask of the wallet on this path.
export function depositFootnote(
  asEth: boolean,
  symbol: string | undefined,
  allowanceTransfer: boolean,
  feeSymbol?: string | undefined,
): ReactNode {
  if (!symbol) return undefined;
  if (asEth) {
    return (
      <>
        ETH is wrapped to WETH, then shielded.
        <span className="only-wide"> One transaction from your wallet.</span>
      </>
    );
  }
  const tokens = feeSymbol && feeSymbol !== symbol ? `${symbol} and ${feeSymbol}` : undefined;
  if (allowanceTransfer) {
    return tokens
      ? `${tokens} move from your wallet in one transaction.`
      : `${symbol} moves from your wallet in one transaction.`;
  }
  return `You sign a permit for ${tokens ?? symbol}, then your wallet sends one transaction.`;
}

/// Why there is no Max on native ETH, shown only when there is a balance.
export function nativeMaxHint(asEth: boolean, balance: bigint | undefined): string | undefined {
  return asEth && balance !== undefined && balance > 0n
    ? "No Max for ETH: the network fee comes out of the same balance and can't be known in advance."
    : undefined;
}

/// The amount as the CTA names it ("1.5 ETH"), once positive.
export function shieldFigure(
  asset: AssetUnits | undefined,
  amount: bigint | undefined,
  symbol: string | undefined,
): string | undefined {
  return asset && amount !== undefined && amount > 0n && symbol
    ? `${formatAmountForDisplay(amount, asset)} ${symbol}`
    : undefined;
}

/// The public balance the deposit draws on, as `AmountHero` shows it.
export function walletBalance(
  value: bigint | undefined,
  decimals: number | undefined,
  symbol: string | undefined,
): ReactNode {
  if (value === undefined || decimals === undefined) return undefined;
  return (
    <>
      {formatFixed(value, decimals, 2, 4)}
      <span className="only-wide"> {symbol}</span>
    </>
  );
}

/// The amount field's error when the total, fees included, exceeds the wallet.
export function depositAmountError(v: AmountValidation): string | undefined {
  return v.insufficient ? "More than your wallet holds once fees are added" : undefined;
}
