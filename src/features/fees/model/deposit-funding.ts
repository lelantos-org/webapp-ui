import { fromBaseUnits, type TokenAmount, toBaseUnits } from "@lelantos-org/sdk";
import { type AssetUnits, asBaseUnits, ZERO_BASE } from "@/shared/domain/units";
import { sameAddress } from "@/shared/lib/address";
import type { FeeAssetFunding } from "./fee-block";

/// What an ERC-20 deposit's relayer fee is funded from: the public wallet, not shielded notes.
export interface DepositFunding {
  /// Amount plus protocol fee in base units of the deposited token; `undefined` until priced.
  principal: TokenAmount | undefined;
  /// Public balances in base units by asset id; an unread one is absent, not zero.
  balances: ReadonlyMap<bigint, TokenAmount>;
}

type FundedAsset = AssetUnits & { id: bigint; token: string };

/// One fee option's balance and verdict against the public wallet, net of the principal when same token.
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
    balance: fromBaseUnits(left, option, { round: "down" }),
    affordable: left >= toBaseUnits(option.amount, option),
  };
}

/// The principal alone overruns the deposited token that would also pay the fee.
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
