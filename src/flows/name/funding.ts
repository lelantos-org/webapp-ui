import { toBaseUnits } from "@lelantos-org/sdk";
import type { NameFee } from "@lelantos-org/sdk/advanced";
import type { RegisteredAsset } from "@/config/chains";
import { sameAddress } from "@/shared/lib/address";
import { feeText } from "./fees";

/// Where a registration's cost is unshielded from. The wallet is always told the asset: it does
/// not map the registrar's fee token to a pool asset by itself.
export type Funding =
  /// The registrar charges a fee: the plain pool asset of its fee token pays.
  | { kind: "fee-token"; asset: RegisteredAsset }
  /// Registration is free, so there is no fee token to follow: the user picks among `options`.
  /// `asset` is `undefined` while the wallet holds none of them and nothing is picked.
  | { kind: "choice"; asset: RegisteredAsset | undefined; options: readonly RegisteredAsset[] }
  /// The pool lists nothing a registration could be paid from.
  | { kind: "unavailable"; reason: string };

/// Resolves the funding asset among the chain's `assets`. A yield asset never funds a
/// registration. Where registration is free, `chosen` is the user's pick, defaulting to the first
/// plain asset the wallet holds.
export function fundingOf(
  fee: NameFee,
  assets: readonly RegisteredAsset[],
  held: (asset: bigint) => bigint,
  chosen?: bigint | undefined,
): Funding {
  const plain = assets.filter((a) => !a.yieldEnabled);
  if (fee.amount > 0n) {
    const asset = plain.find((a) => sameAddress(a.token, fee.token));
    return asset
      ? { kind: "fee-token", asset }
      : {
          kind: "unavailable",
          reason:
            "The registrar's fee token is not a pool asset here, so a claim can't be paid from shielded funds.",
        };
  }
  if (plain.length === 0) {
    return {
      kind: "unavailable",
      reason: "This network's pool lists no asset a claim could be paid from.",
    };
  }
  const asset = plain.find((a) => a.id === chosen) ?? plain.find((a) => held(a.id) > 0n);
  return { kind: "choice", asset, options: plain };
}

/// What to say when a free registration has no asset to be paid from yet.
const NOTHING_HELD_REASON = "You need shielded funds to pay the relayer";

/// Why `balance` (circuit units of `asset`) cannot cover the registration, or `undefined` when it
/// may. The relayer's fee is not known here, so this only catches a balance under the registrar's.
export function fundingShortfall(
  fee: Pick<NameFee, "amount">,
  asset: RegisteredAsset,
  balance: bigint,
): string | undefined {
  if (fee.amount === 0n) {
    return balance > 0n ? undefined : `You need some shielded ${asset.symbol} to pay the relayer`;
  }
  return toBaseUnits(balance, asset) > fee.amount
    ? undefined
    : `You need more than ${feeText(fee.amount, asset)} shielded to pay the registrar and the relayer`;
}

/// Why the wallet cannot pay for the registration, or `undefined` when it can. `balance` is what
/// it holds of the funding asset, in circuit units; `undefined` while that is not known, which
/// holds nothing back.
export function fundingProblem(
  fee: Pick<NameFee, "amount">,
  funding: Funding,
  balance: bigint | undefined,
): string | undefined {
  if (funding.kind === "unavailable") return undefined;
  if (!funding.asset) return NOTHING_HELD_REASON;
  return balance === undefined ? undefined : fundingShortfall(fee, funding.asset, balance);
}
