// A deposit's relayer fee options, judged against the public wallet.
//
// The quote's own `balance` and `affordable` describe shielded notes, which a
// deposit never touches: its relayer note is funded from the public wallet,
// alongside the principal where the two share a token. Pure, so the verdicts the
// picker shows and the shortfall the panel reports are testable without the
// balance reads behind them.

import { fromBaseUnits, type TokenAmount, toBaseUnits } from "@lelantos-org/sdk";
import { type AssetUnits, asBaseUnits, ZERO_BASE } from "@/shared/domain/units";
import { sameAddress } from "@/shared/lib/address";
import type { FeeAssetFunding } from "./fee-block";

/// What an ERC-20 deposit's relayer fee is funded from.
export interface DepositFunding {
  /// The amount plus its protocol fee, in base units of the deposited token, or
  /// `undefined` until it is priced.
  principal: TokenAmount | undefined;
  /// Public token balances in base units, by asset id. An unread one is absent:
  /// unknown, not zero.
  balances: ReadonlyMap<bigint, TokenAmount>;
}

type FundedAsset = AssetUnits & { id: bigint; token: string };

/// One fee option's balance and verdict, against the public wallet.
///
/// A fee in the deposited token — its own id, or another over the same ERC-20 —
/// is pulled from the balance the principal is, so the balance stated is what is
/// left once the principal is taken, and the picker's "needs … more" is the real
/// gap. Before the principal is priced the fee is judged alone.
export function depositFeeFunding(
  option: FundedAsset & { amount: bigint },
  deposited: Pick<FundedAsset, "token">,
  funding: DepositFunding,
): FeeAssetFunding {
  const balance = funding.balances.get(option.id);
  if (balance === undefined) return { balance: undefined, affordable: true };
  const alongside = sameAddress(option.token, deposited.token)
    ? (funding.principal ?? ZERO_BASE)
    : ZERO_BASE;
  const left = asBaseUnits(balance > alongside ? balance - alongside : 0n);
  return {
    // Circuit units, as the picker formats an option.
    balance: fromBaseUnits(left, option, { round: "down" }),
    affordable: left >= toBaseUnits(option.amount, option),
  };
}

/// The principal alone overruns the deposited token, and the fee would be drawn
/// from that same token.
///
/// A shortfall in that case is the amount field's to report: blaming the relayer
/// fee, or offering to pay it in another asset, would not help.
export function principalOverruns(
  paying: Pick<FundedAsset, "token">,
  deposited: Pick<FundedAsset, "id" | "token">,
  funding: DepositFunding,
): boolean {
  const balance = funding.balances.get(deposited.id);
  return (
    sameAddress(paying.token, deposited.token) &&
    funding.principal !== undefined &&
    balance !== undefined &&
    funding.principal > balance
  );
}
