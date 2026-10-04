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

/// The largest amount the balance counts but a spend cannot reach, and its cause. The slot cap is reported by `MaxNotice`.
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

/// How an amount sits against what one spend can reach now: within it, within it once the funds
/// are merged (the slot cap), or beyond it until something else settles.
export type SpendReach = "direct" | "merge" | "held";

export function spendReach(
  parsed: bigint | undefined,
  spendable: SpendableMax | undefined,
): SpendReach {
  if (parsed === undefined || !spendable || parsed <= spendable.max) return "direct";
  return parsed <= spendable.max + spendable.withheld.slots ? "merge" : "held";
}

export const MERGE_HINT =
  "More than one transaction can move at once: your funds are combined first, which takes one extra proof and one extra relayer fee";

/// Why an amount the balance covers still cannot be sent now.
export function heldReason(spendable: SpendableMax, meta: AssetMeta): string {
  const reachable = spendable.max + spendable.withheld.slots;
  const cause = withheldHint(spendable, meta);
  const most = `${formatAssetAmount(reachable, meta)} is the most you can send right now`;
  return cause ? `${most}: ${cause}` : most;
}

/// `MaxNotice`'s copy when the circuit's input cap holds Max below the balance.
export interface MaxNoticeCopy {
  /// The ceiling, as "3,180.00": two to six places, no symbol.
  max: string;
  /// Everything after the figure in the first sentence.
  tail: string;
  follow: string;
}

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
