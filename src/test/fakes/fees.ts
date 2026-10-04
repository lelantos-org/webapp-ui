import type { RegisteredAsset } from "@/config/chains";
import type { FeePanel } from "@/features/fees";

export function idleFeePanel(over: Partial<FeePanel> = {}): FeePanel {
  return {
    model: undefined,
    refreshing: false,
    relayerAmount: 0n,
    feeAsset: undefined,
    block: undefined,
    pending: false,
    ...over,
  };
}

/// A `useFeePanel` for a transfer the relayer prices at `relayerAmount` of the asset sent. Takes
/// the real `feeSummary`, since the fake is built inside the module's own mock.
export function pricedTransferPanel(
  feeSummary: typeof import("@/features/fees").feeSummary,
  relayerAmount: bigint,
) {
  return (i: { selected: RegisteredAsset | undefined; amount: bigint | undefined }): FeePanel =>
    idleFeePanel({
      model: feeSummary({
        kind: "transfer",
        amount: i.amount,
        spendAsset: i.selected,
        protocol: undefined,
        relayer: i.selected ? { amount: relayerAmount, asset: i.selected } : undefined,
      }),
      relayerAmount,
    });
}

/// The fee components and preview query a form renders, blanked.
export function blankFeeChrome() {
  return {
    FeeDetails: () => null,
    FeeSummary: () => null,
    useFeePreview: () => ({}),
  };
}
