// The quiet lines under a spend's amount: what is settling, and what is held back.

import type { SpendableMax } from "@lelantos-org/sdk/wallet";
import { formatAmountForDisplay, formatAssetAmount } from "@/shared/lib/format/asset";
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
