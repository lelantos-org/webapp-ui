import { useCallback } from "react";
import { txExplorerUrl } from "@/shared/lib/toast";
import { useActiveChainOrUndefined } from "./ChainProvider";

/// Builds explorer links for the active chain.
///
/// The component-side counterpart to passing an explorer base explicitly:
/// non-React callers (the lifecycle tracker) receive the chain they submitted
/// on, and components read the one currently selected.
export function useTxExplorerUrl(): (txHash: string) => string | undefined {
  const explorerUrl = useActiveChainOrUndefined()?.explorerUrl;
  return useCallback((txHash: string) => txExplorerUrl(explorerUrl, txHash), [explorerUrl]);
}
