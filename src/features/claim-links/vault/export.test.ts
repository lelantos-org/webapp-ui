// @vitest-environment jsdom
// The export file is the sender's copy of every live link, so it has to carry
// the same records, in the same order, as the vault screen lists.

import { beforeEach, describe, expect, it } from "vitest";
import { claimLinksExport, EXPORT_WARNING, exportFileName } from "./export";
import * as policy from "./policy";
import type { RememberClaimLinkInput } from "./store";
import * as store from "./store";

const CHAIN = 31337n;

const input = (over: Partial<RememberClaimLinkInput> = {}): RememberClaimLinkInput => ({
  url: "https://app/claim#deadbeef",
  chainId: CHAIN,
  assetId: 1n,
  amount: 1_000n,
  ...over,
});

/// A fresh store per test, as in `store.test.ts`: clearing `localStorage` does
/// not reach the store's "storage refused the write" latch.
const vault = { ...store, ...policy };

beforeEach(() => {
  localStorage.clear();
  store.resetForTest();
});

describe("vault export", () => {
  it("exports live links oldest first, with the warning inside the file", () => {
    const now = 10_000_000;
    vault.rememberClaimLink(input({ url: "https://app/claim#old" }), now - 2_000);
    const id = vault.rememberClaimLink(input({ url: "https://app/claim#new" }), now - 1_000);
    vault.markClaimLinkBroadcast(id, "0xfeed", now - 1_000);

    const doc = claimLinksExport(vault.claimLinksSnapshot(), now);

    expect(doc.kind).toBe("lelantos-claim-links");
    expect(doc.warning).toBe(EXPORT_WARNING);
    expect(doc.links.map((l) => l.url)).toEqual(["https://app/claim#old", "https://app/claim#new"]);
    expect(doc.links[1]).toEqual({
      url: "https://app/claim#new",
      chainId: CHAIN.toString(),
      assetId: "1",
      amount: "1000",
      createdAt: new Date(now - 1_000).toISOString(),
      txHash: "0xfeed",
    });
    expect(doc.links[0]).not.toHaveProperty("txHash");
  });

  it("leaves expired records out of the export", () => {
    const { ttlMs } = vault.claimLinkPressureOf(vault.claimLinksSnapshot());
    vault.rememberClaimLink(input(), 0);

    expect(claimLinksExport(vault.claimLinksSnapshot(), ttlMs + 1).links).toEqual([]);
  });

  it("dates the export file", () => {
    expect(exportFileName(Date.UTC(2026, 8, 11))).toBe("lelantos-claim-links-2026-09-11.json");
  });
});
