// The protocol-fee line under an amount field, and the rule for when it may
// be shown at all.

import type { FeePreviewResult } from "@/features/actions/use-fee-preview";
import type { FeeBreakdown } from "@/shared/lib/fees";
import { formatDecimalCompact } from "@/shared/lib/format";

/// The preview's data, or `undefined` while the debounce is catching up.
///
/// During that window `data` describes the *previous* keystroke's amount, and
/// this is the line the user reads immediately before clicking submit — so a
/// fee for one amount is never shown against another. Deposit validation gates
/// its submit button on the same absence (`feeUnknown`).
export function settledFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.stale ? undefined : fee.data;
}

/// Where the fee falls relative to the amount the user typed.
///
/// A deposit is charged the fee *on top* (`total = amount + fee`), so the
/// figure that matters is what leaves the wallet. A withdraw has it *deducted*
/// (`total = amount - fee`), so it is what arrives.
export type FeeSide = "total" | "receive";

/// `fee 0.003 (0.30%) · total 1.003 USDC`, or `undefined` when there is no fee
/// to state — the chain charges none, or the preview has not settled.
///
/// Amounts are in ERC20 base units, so they format by the token's decimals
/// alone, without the circuit-units scale.
export function feeLine(
  fee: FeeBreakdown | undefined,
  asset: { symbol: string; decimals: number } | undefined,
  side: FeeSide,
): string | undefined {
  if (!asset || !fee || fee.fee === 0n) return undefined;
  const fmt = (v: bigint) => formatDecimalCompact(v, asset.decimals);
  const bps = (Number(fee.feeBps) / 100).toFixed(2);
  return `fee ${fmt(fee.fee)} (${bps}%) · ${side} ${fmt(fee.total)} ${asset.symbol}`;
}

/// Join hint fragments with the separator the forms use, dropping empties.
export function joinHint(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length > 0 ? kept.join(" · ") : undefined;
}
