// Shared "balance + settling" hint formatter for action forms.

import type { SpendableMax } from "@lelantos-org/sdk/wallet";
import { formatAmountForAsset } from "@/shared/lib/format";
import type { AssetMeta } from "./amount-field";

// Re-exported so existing `balance-hint` importers keep one import; the type
// itself belongs with the amount parsing that defines it.
export type { AssetMeta };

/// Build the secondary "balance N · settling ±M" line shown under the
/// amount field. Returns `undefined` while the balance is still loading.
export function balanceHint(
  balance: bigint | undefined,
  pending: bigint,
  outflow: bigint,
  meta: AssetMeta,
): string | undefined {
  if (balance === undefined) return undefined;
  const fmt = (v: bigint) => formatAmountForAsset(v, meta.decimals, meta.scale);
  const sym = meta.symbol ? ` ${meta.symbol}` : "";
  if (outflow > 0n) return `balance ${fmt(balance)}${sym} · settling -${fmt(outflow)}`;
  if (pending > 0n) return `balance ${fmt(balance)}${sym} · settling +${fmt(pending)}`;
  return `balance ${fmt(balance)}${sym}`;
}

/// Names value the balance counts but a spend cannot reach, and why.
///
/// Without this the max button simply writes a smaller number than the balance
/// printed above it, which reads as a bug — and the failure it replaced was the
/// app's own max being rejected by the app's own selector.
///
/// The causes are not interchangeable, which is why they are named rather than
/// summed: `slots` means the value is there and reachable by consolidating,
/// while the other three mean it needs time. Reports the largest single cause
/// rather than a list — the hint sits inline under the amount field, and three
/// clauses there is a paragraph nobody reads.
export function withheldHint(
  spendable: SpendableMax | undefined,
  meta: AssetMeta,
): string | undefined {
  if (!spendable) return undefined;
  const { reserved, cooldown, dust, slots } = spendable.withheld;
  const causes = [
    // Ordered by how actionable each is, which breaks ties toward the one the
    // user can do something about.
    { value: slots, why: "needs consolidating" },
    { value: cooldown, why: "still settling" },
    { value: reserved, why: "awaiting an earlier send" },
    { value: dust, why: "below the dust threshold" },
  ];
  const worst = causes.reduce((a, b) => (b.value > a.value ? b : a));
  if (worst.value <= 0n) return undefined;

  const sym = meta.symbol ? ` ${meta.symbol}` : "";
  const amount = formatAmountForAsset(worst.value, meta.decimals, meta.scale);
  return `${amount}${sym} ${worst.why}`;
}
