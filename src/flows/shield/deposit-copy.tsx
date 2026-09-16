// Shield's lines that depend on the path the deposit takes, and the figures the
// form states: apart from the screen so they read without its hooks.

import type { ReactNode } from "react";
import type { AmountValidation } from "@/features/op-form";
import type { AssetUnits } from "@/shared/domain/units";
import { formatAmountForDisplay } from "@/shared/lib/format/asset";
import { formatFixed } from "@/shared/lib/format/number";

/// The line under the CTA: what the shield will ask of the wallet.
///
/// Per path, because the three differ in what the wallet shows. Native coin is
/// one payable transaction (the contract wraps it). An AllowanceTransfer chain
/// pulls within the window setup granted, so it is one transaction too. The
/// witness path signs a Permit2 message first.
///
/// `feeSymbol` names a second token the relayer fee is pulled in; both leave
/// the wallet in the same transaction, under the same permit.
///
/// A value rather than a component: `ActionForm` reserves the footnote's row
/// only for a defined one.
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

/// Why there is no Max on native ETH, said where the button would be.
///
/// A native deposit pays its gas from the same balance it draws on, and nothing
/// here can estimate that gas, so any "max" would be a figure the wallet then
/// refuses. Only said when there is a balance to be maxed.
export function nativeMaxHint(asEth: boolean, balance: bigint | undefined): string | undefined {
  return asEth && balance !== undefined && balance > 0n
    ? "No Max for ETH: the network fee comes out of the same balance and can't be known in advance."
    : undefined;
}

/// The amount as the CTA and the progress card name it: "1.5 ETH". Absent until
/// there is a positive amount of a named asset.
export function shieldFigure(
  asset: AssetUnits | undefined,
  amount: bigint | undefined,
  symbol: string | undefined,
): string | undefined {
  return asset && amount !== undefined && amount > 0n && symbol
    ? `${formatAmountForDisplay(amount, asset)} ${symbol}`
    : undefined;
}

/// The public balance the deposit draws on, in base units, as `AmountHero`
/// shows it. A value rather than a component: the hero reserves the balance row
/// only for a defined one.
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

/// The field's own error for a deposit: its total, fees included, is more than
/// the wallet holds. Other amount problems are said under the button.
export function depositAmountError(v: AmountValidation): string | undefined {
  return v.insufficient ? "More than your wallet holds once fees are added" : undefined;
}
