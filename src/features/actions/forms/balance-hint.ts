// Shared "balance + settling" hint formatter for action forms.

import type { AssetMeta } from "@/features/actions/forms/amount-field";
import { formatAmountForAsset } from "@/shared/lib/format";

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
