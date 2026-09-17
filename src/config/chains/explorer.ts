import { stripTrailingSlash } from "@/config/url";

/// Explorer link for a tx, or `undefined` when the chain has no explorer.
export function txExplorerUrl(explorerUrl: string | undefined, txHash: string): string | undefined {
  if (!explorerUrl) return undefined;
  return `${stripTrailingSlash(explorerUrl)}/tx/${txHash}`;
}
