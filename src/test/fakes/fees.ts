import type { FeePanel } from "@/features/fees";

/// An empty, idle fee panel, with overrides.
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

/// The fee components and preview query a form renders, blanked.
export function blankFeeChrome() {
  return {
    FeeDetails: () => null,
    FeeSummary: () => null,
    useFeePreview: () => ({}),
  };
}
