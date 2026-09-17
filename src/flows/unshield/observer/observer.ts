import { isEvmAddress } from "@/features/op-form";
import type { AssetUnits } from "@/shared/domain/units";
import { sameAddress, shortAddr } from "@/shared/lib/address";
import { formatAmountForDisplay, formatAssetFixed } from "@/shared/lib/format/asset";
import type { LadderVerdict } from "../denominations/ladder";

const DENIED = "The bars are what an observer is denied — never your own figures from you.";

/// What `observerOutro` reads.
export interface ObserverOutroInputs {
  verdict: LadderVerdict;
  /// The amount as the chain will publish it, without a symbol.
  figure: string | undefined;
  /// The review's one-sentence form.
  compact?: boolean;
}

/// The line under the observer rows, phrased from the ladder verdict so it never overclaims.
export function observerOutro({
  verdict,
  figure,
  compact = false,
}: ObserverOutroInputs): string | undefined {
  const known = figure !== undefined && figure !== "" ? verdict : undefined;
  if (compact) {
    if (known === "on") return `${figure} is a shared denomination — many withdrawals publish it.`;
    if (known === "off")
      return `${figure} is not a shared denomination, so it stands out on-chain.`;
    return undefined;
  }
  if (known === "on")
    return `Two facts, and ${figure} is a figure many withdrawals publish. ${DENIED}`;
  if (known === "off") {
    return `Two facts, and ${figure} is not a shared denomination — the exact figure can tie this withdrawal to whatever funded it. ${DENIED}`;
  }
  return `Two facts: where it lands and how much. ${DENIED}`;
}

/// What the chain will publish about a withdrawal, formatted for the panel.
export interface ObserverFacts {
  /// The public destination, shortened, once it is a valid address.
  destination: string | undefined;
  /// The gross the withdrawal event carries, with the symbol that arrives.
  amount: string | undefined;
  figure: string | undefined;
}

/// What the chain will publish about a withdrawal: the destination and the gross.
export function observerFacts({
  to,
  asset,
  amount,
  symbol,
}: {
  to: string;
  asset: AssetUnits | undefined;
  amount: bigint | undefined;
  symbol: string;
}): ObserverFacts {
  const priced = asset && amount !== undefined && amount > 0n ? { asset, amount } : undefined;
  return {
    destination: isEvmAddress(to) ? shortAddr(to, 4) : undefined,
    amount: priced ? `${formatAssetFixed(priced.amount, priced.asset, 6)} ${symbol}` : undefined,
    figure: priced ? formatAmountForDisplay(priced.amount, priced.asset) : undefined,
  };
}

/// True when the recipient is the connected account, which funded the deposits and so links both sides of the pool.
export function isSelfWithdraw(to: string, ethAddress?: string): boolean {
  if (!ethAddress || !isEvmAddress(to)) return false;
  return sameAddress(to, ethAddress);
}
