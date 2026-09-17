import { plural } from "@/shared/lib/format/text";
import { createLogger } from "@/shared/lib/logger";
import { toast } from "@/shared/lib/toast";
import { normalize } from "./policy";
import type { StoredClaimLink } from "./record";
import { claimLinksSnapshot } from "./store";

const log = createLogger("claim-links:export");

/// The name the export downloads as: `lelantos-claim-links-2026-09-11.json`.
export function exportFileName(now = Date.now()): string {
  return `lelantos-claim-links-${new Date(now).toISOString().slice(0, 10)}.json`;
}

/// The file "Export all links" downloads. It carries its own warning.
export interface ClaimLinkExport {
  kind: "lelantos-claim-links";
  version: 1;
  exportedAt: string;
  warning: string;
  links: Array<{
    url: string;
    chainId: string;
    assetId: string;
    /// Circuit units.
    amount: string;
    /// ISO 8601.
    createdAt: string;
    txHash?: string;
  }>;
}

export const EXPORT_WARNING =
  "Every url in this file is a spending key. Anyone who opens one takes the funds. " +
  "Keep the file somewhere only you can read, and delete it once the links are claimed.";

/// The export document for `records`: live links, oldest first.
export function claimLinksExport(
  records: readonly StoredClaimLink[],
  now = Date.now(),
): ClaimLinkExport {
  const live = normalize(records, now).reverse();
  return {
    kind: "lelantos-claim-links",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    warning: EXPORT_WARNING,
    links: live.map((r) => ({
      url: r.url,
      chainId: r.chainId,
      assetId: r.assetId,
      amount: r.amount,
      createdAt: new Date(r.createdAt).toISOString(),
      ...(r.txHash ? { txHash: r.txHash } : {}),
    })),
  };
}

/// Download every live link as JSON and return the count. The object URL is revoked a task
/// later: some engines cancel a download whose URL is already gone.
export function downloadClaimLinks(now = Date.now()): number {
  const doc = claimLinksExport(claimLinksSnapshot(), now);
  const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = exportFileName(now);
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
  // Counts only: the urls are the secret.
  log.info(`exported ${doc.links.length} claim link(s)`);
  return doc.links.length;
}

/// Export with the confirmation toast, shared by the capacity box and the eviction block.
export function exportAllClaimLinks(): number {
  const n = downloadClaimLinks();
  toast.success(`Saved ${plural(n, "link")} to a file`, {
    description: "Every link in it is a spending key. Keep it somewhere only you can open.",
  });
  return n;
}
