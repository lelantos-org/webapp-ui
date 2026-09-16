// What the observer panel says under its redacted rows.
//
// The panel is the one honest use of a redaction bar: it shows what someone
// else is denied, never the user's own figures from them. What it may claim
// about the amount depends on the ladder — a shared denomination is "a figure
// many withdrawals publish", an off-ladder one is not — so the sentence is built
// from the ladder's own verdict rather than phrased at the call site.

import { isEvmAddress } from "@/features/op-form";
import type { AssetUnits } from "@/shared/domain/units";
import { sameAddress, shortAddr } from "@/shared/lib/address";
import { formatAmountForDisplay, formatAssetFixed } from "@/shared/lib/format/asset";
import type { LadderVerdict } from "../denominations/ladder";

/// The closing clause of the full panel, the same whatever the amount.
const DENIED = "The bars are what an observer is denied — never your own figures from you.";

export interface ObserverOutroInputs {
  verdict: LadderVerdict;
  /// The amount as the chain will publish it, without a symbol: "500".
  figure: string | undefined;
  /// The review's short form: one sentence, no mention of the bars.
  compact?: boolean;
}

/// The line under the observer rows.
///
/// Full panel (the form):
///   - on the ladder  → "Two facts, and 500 is a figure many withdrawals publish. …"
///   - off the ladder → "Two facts, and 523 is not a shared denomination — …"
///   - nothing to judge (no amount, or no ladder for the asset) →
///                      "Two facts: where it lands and how much. …"
///
/// Compact (the review): the verdict alone, or `undefined` when there is none —
/// the review always has an amount, so a missing verdict there means the asset
/// has no ladder, and saying nothing claims nothing.
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

export interface ObserverFacts {
  /// The public destination, shortened, once it is a valid address.
  destination: string | undefined;
  /// The gross the withdrawal event carries, with the symbol that arrives.
  amount: string | undefined;
  /// The same gross without a symbol, for the outro's sentence.
  figure: string | undefined;
}

/// What the chain will publish about a withdrawal: the destination, and the
/// gross — the figure the ladder judges, since that is what the event carries.
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

/// True when the withdrawal recipient is the account the user is connected with.
///
/// That account funds their deposits — `payerAddress()` resolves to the signer's
/// address — so using it as the recipient puts one address on both sides of the
/// pool, which is the link a shielded withdrawal exists to break.
///
/// Gated on `isEvmAddress` so a half-typed value cannot match the live-watched
/// field, and compared case-insensitively since wallets return either EIP-55 or
/// lowercase.
export function isSelfWithdraw(to: string, ethAddress?: string): boolean {
  if (!ethAddress || !isEvmAddress(to)) return false;
  return sameAddress(to, ethAddress);
}
