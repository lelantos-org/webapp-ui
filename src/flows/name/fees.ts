import type { FeeQuote } from "@lelantos-org/sdk";
import type { NameFee } from "@lelantos-org/sdk/advanced";
import type { RegisteredAsset } from "@/config/chains";
import { formatBaseFixed } from "@/shared/lib/format/asset";

/// Fractional digits a fee is shown with.
const FEE_FRAC = 6;

/// A fee of `baseUnits` of `asset`, as text.
export function feeText(baseUnits: bigint, asset: RegisteredAsset): string {
  return formatBaseFixed(baseUnits, asset, FEE_FRAC);
}

/// A fee as the form shows it: its text, or where the read of it stands.
export type FeeReading =
  | { state: "ready"; text: string }
  | { state: "failed" }
  | { state: "loading" };

/// The reading of a fee whose `text` is `undefined` until it is known. A text in hand is shown
/// even when a later read failed.
export function feeReading(text: string | undefined, failed: boolean): FeeReading {
  if (text !== undefined) return { state: "ready", text };
  return { state: failed ? "failed" : "loading" };
}

/// The registrar's fee as text, in the asset that pays it; `undefined` until that asset is known.
export function registrarFeeLabel(
  fee: Pick<NameFee, "amount">,
  asset: RegisteredAsset | undefined,
): string | undefined {
  if (fee.amount === 0n) return "Free";
  return asset ? feeText(fee.amount, asset) : undefined;
}

/// The relayer's quoted fee as the form shows it. `undefined` while it is quoted.
export function relayerFeeLabel(
  quote: Pick<FeeQuote, "charged" | "options"> | undefined,
  asset: RegisteredAsset | undefined,
): string | undefined {
  if (!quote || !asset) return undefined;
  if (!quote.charged) return "None";
  const option = quote.options.find((o) => o.asset.id === asset.id);
  // The relayer charges, and not in this asset: the claim would be refused.
  if (!option) return `Not payable in ${asset.symbol}`;
  return feeText(option.baseUnits, asset);
}
