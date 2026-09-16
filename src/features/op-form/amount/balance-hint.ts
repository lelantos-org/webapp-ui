// The quiet lines under a spend's amount: what is settling, and what is held back,
// and `MaxNotice`'s fuller note when the circuit's input cap is why.

import type { SpendableMax } from "@lelantos-org/sdk";
import {
  formatAmountForDisplay,
  formatAssetAmount,
  formatAssetFixed,
} from "@/shared/lib/format/asset";
import type { AssetMeta } from "./amount-validation";

/// The in-flight adjustment to a balance, for the quiet line under `AmountHero`,
/// whose balance row states the figure itself: "Settling −7 WETH".
///
/// Outflow wins over inflow when both are in flight: money leaving is the one
/// that can make a later spend fail, so it is the one worth naming. `undefined`
/// when nothing is settling, or while the balance is loading.
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

/// Names value the balance counts but a spend cannot reach, and why.
///
/// Without it the max button writes a smaller number than the balance printed
/// beside it, with nothing to explain the difference.
///
/// The slot cap is not reported here. It is the cause that surprises — the value
/// is spendable, just not all in one transaction — and it gets `MaxNotice`'s
/// fuller explanation instead, which a clause under the amount cannot carry.
/// What remains all means the same thing, "wait", so the largest single cause
/// is enough.
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

/// What `MaxNotice` says when Max sits below the balance because of the circuit's
/// input cap.
///
/// Never "needs consolidating": that names a remedy the user cannot perform —
/// consolidation is automatic and invisible (`autoConsolidate: true` in
/// `sdk-adapter.ts`), and no control does it.
///
/// It also never names the mechanism. "Notes", the circuit's input arity and the
/// slot cap are all invisible to whoever is holding the balance, and a sentence
/// built on them explains one unknown with another. So the copy says only what
/// the user can act on: this is the most one transaction moves, the rest is
/// still theirs, and it resolves by itself.
export interface MaxNoticeCopy {
  /// The ceiling, as "3,180.00": two places, no symbol.
  max: string;
  /// Everything after the figure in the first sentence.
  tail: string;
  /// The reassurance line.
  follow: string;
}

export interface MaxNoticeInputs {
  spendable: SpendableMax | undefined;
  meta: AssetMeta;
  /// How the op names itself at the start of the reassurance: "Sending",
  /// "Unshielding".
  verb: string;
}

/// The notice's copy, or `undefined` when nothing is held back by the slot cap.
///
/// Only the slot cap. The other withheld causes (cooldown, reservation, dust)
/// mean "wait" rather than "this is how spending works", and `withheldHint`
/// covers them in a clause.
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
