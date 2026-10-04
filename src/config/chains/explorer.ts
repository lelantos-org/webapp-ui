import { stripTrailingSlash } from "@/config/url";

export function txExplorerUrl(explorerUrl: string | undefined, txHash: string): string | undefined {
  if (!explorerUrl) return undefined;
  return `${stripTrailingSlash(explorerUrl)}/tx/${txHash}`;
}
