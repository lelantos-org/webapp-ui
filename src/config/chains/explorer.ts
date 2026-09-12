// Links into a chain's block explorer.

import { stripTrailingSlash } from "@/config/url";

/// Pure: the explorer base is per-chain, so it is passed in rather than read from
/// a module global. `undefined` when the chain has no explorer configured, which
/// callers render as plain text instead of a link.
export function txExplorerUrl(explorerUrl: string | undefined, txHash: string): string | undefined {
  if (!explorerUrl) return undefined;
  return `${stripTrailingSlash(explorerUrl)}/tx/${txHash}`;
}
