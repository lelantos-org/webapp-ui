// The file "Export all links" downloads, and the download itself.
//
// The document is pure. The download is the vault's one DOM side effect — a
// Blob URL and a synthetic click — kept here so the store stays free of the DOM
// beyond `localStorage`.

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

/// The file "Export all links" downloads.
///
/// Every field needed to use or place a link again, and nothing derived: a
/// link's amount is in circuit units, as stored, alongside the chain and asset
/// that give it meaning. The warning travels inside the file, because the file
/// outlives the screen that explained it.
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

/// Pure: the export document for `records`, oldest first — the order the vault
/// lists them and the order they drop.
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

/// Download every live link as JSON. Returns how many went into the file.
///
/// The object URL is revoked on the next task rather than immediately: some
/// engines start the download asynchronously and cancel it if the URL is gone
/// by then.
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

/// Export, with the confirmation toast. Shared by the capacity box and the
/// eviction block so both say the same thing about the file.
export function exportAllClaimLinks(): number {
  const n = downloadClaimLinks();
  toast.success(`Saved ${plural(n, "link")} to a file`, {
    description: "Every link in it is a spending key. Keep it somewhere only you can open.",
  });
  return n;
}
