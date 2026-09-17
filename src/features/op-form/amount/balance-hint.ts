import type { SpendableMax } from "@lelantos-org/sdk";
import {
  formatAmountForDisplay,
  formatAssetAmount,
  formatAssetFixed,
} from "@/shared/lib/format/asset";
import type { AssetMeta } from "./amount-validation";

/// The in-flight change to a balance, "Settling −7 WETH"; outflow wins over inflow.
export function settlingHint(
  balance: bigint | undefined,
  pending: bigint,
  outflow: bigint,
  meta: AssetMeta,
): string | undefined {
  if (balance === undefined) return undefined;
  const suffix = meta.symbol ? ` ${meta.symbol}` : "";
  if (outflow > 0n) return `Settling −${formatAmountForDisplay(outflow, meta)}${suffix}`;
  if (pending > 0n) return `Settling +${formatAmountForDisplay(pending, meta)}${suffix}`;
  return undefined;
}

/// The largest value the balance counts but a spend cannot reach, and why. The slot cap is `MaxNotice`'s.
export function withheldHint(
  spendable: SpendableMax | undefined,
  meta: AssetMeta,
): string | undefined {
  if (!spendable) return undefined;
  const { reserved, cooldown, dust } = spendable.withheld;
  const causes = [
    { value: cooldown, why: "still settling" },
    { value: reserved, why: "awaiting an earlier send" },
    { value: dust, why: "below the dust threshold" },
  ];
  const worst = causes.reduce((a, b) => (b.value > a.value ? b : a));
  if (worst.value <= 0n) return undefined;

  return `${formatAssetAmount(worst.value, meta)} ${worst.why}`;
}

/// `MaxNotice`'s copy when the circuit's input cap holds Max below the balance.
export interface MaxNoticeCopy {
  /// The ceiling, as "3,180.00": two places, no symbol.
  max: string;
  /// Everything after the figure in the first sentence.
  tail: string;
  follow: string;
}

/// What `maxNoticeCopy` reads.
export interface MaxNoticeInputs {
  spendable: SpendableMax | undefined;
  meta: AssetMeta;
  /// How the op names itself: "Sending", "Unshielding".
  verb: string;
}

/// The notice's copy, or `undefined` when the slot cap holds nothing back.
export function maxNoticeCopy({
  spendable,
  meta,
  verb,
}: MaxNoticeInputs): MaxNoticeCopy | undefined {
  if (!spendable || spendable.withheld.slots <= 0n) return undefined;
  return {
    max: formatAssetFixed(spendable.max, meta, 6),
    tail: " — the most you can move at once. The rest of your balance is still there.",
    follow: `${verb} raises this limit on its own, so nothing is stuck.`,
  };
}
