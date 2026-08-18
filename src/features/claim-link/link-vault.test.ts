// The vault is the only thing standing between a chain switch and permanently
// unrecoverable funds, so its ordering guarantees matter more than its shape.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetClaimLink,
  listClaimLinks,
  markClaimLinkBroadcast,
  pruneExpiredClaimLinks,
  rememberClaimLink,
} from "@/features/claim-link/link-vault";

const CHAIN = 31337n;

const input = (over: Partial<Parameters<typeof rememberClaimLink>[0]> = {}) => ({
  url: "https://app/claim#deadbeef",
  chainId: CHAIN,
  assetId: 1n,
  amount: 1_000n,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe("link-vault", () => {
  it("stores a link before it has a tx hash", () => {
    // The record is written before the transfer is broadcast, so the window in
    // which the key exists only in memory is empty. A record with no `txHash`
    // is the case that most needs recovering, not one to hide.
    rememberClaimLink(input());

    const [record] = listClaimLinks(CHAIN);
    expect(record.url).toBe("https://app/claim#deadbeef");
    expect(record.txHash).toBeUndefined();
  });

  it("attaches the tx hash to the record it created", () => {
    const id = rememberClaimLink(input());

    markClaimLinkBroadcast(id, "0xabc");

    expect(listClaimLinks(CHAIN)[0].txHash).toBe("0xabc");
  });

  it("keeps links separate per chain", () => {
    rememberClaimLink(input());
    rememberClaimLink(input({ chainId: 1n }));

    expect(listClaimLinks(CHAIN)).toHaveLength(1);
    expect(listClaimLinks(1n)).toHaveLength(1);
  });

  it("forgets only the record asked for", () => {
    const keep = rememberClaimLink(input());
    const drop = rememberClaimLink(input({ amount: 2_000n }));

    forgetClaimLink(drop);

    const ids = listClaimLinks(CHAIN).map((l) => l.id);
    expect(ids).toEqual([keep]);
  });

  it("drops records past the retention window", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01"));
      rememberClaimLink(input());
      expect(listClaimLinks(CHAIN)).toHaveLength(1);

      vi.setSystemTime(new Date("2026-03-01"));
      expect(listClaimLinks(CHAIN)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("survives a corrupted store rather than throwing", () => {
    localStorage.setItem("lelantos:claim-links:v1", "{not json");

    expect(listClaimLinks(CHAIN)).toEqual([]);
    // And it recovers: the next write replaces the garbage.
    rememberClaimLink(input());
    expect(listClaimLinks(CHAIN)).toHaveLength(1);
  });

  it("ignores entries that are not shaped like records", () => {
    localStorage.setItem("lelantos:claim-links:v1", JSON.stringify([{ nope: true }, null, 7]));

    expect(listClaimLinks(CHAIN)).toEqual([]);
  });

  it("rejects a record whose amount is not a number", () => {
    // `UnclaimedLinks` calls `BigInt(record.amount)` mid-render, where a throw
    // unmounts the tab holding every other link. The bad entry is refused at the
    // boundary instead.
    localStorage.setItem(
      "lelantos:claim-links:v1",
      JSON.stringify([
        {
          id: "a",
          url: "https://app/claim#x",
          chainId: CHAIN.toString(),
          assetId: "1",
          amount: "1e3",
          createdAt: Date.now(),
        },
      ]),
    );

    expect(listClaimLinks(CHAIN)).toEqual([]);
  });

  it("removes expired records from storage, not just from the answer", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01"));
      rememberClaimLink(input());

      vi.setSystemTime(new Date("2026-03-01"));
      // Filtered out of every view, but the spending key was still on disk.
      expect(listClaimLinks(CHAIN)).toHaveLength(0);
      expect(pruneExpiredClaimLinks()).toBe(true);

      expect(JSON.parse(localStorage.getItem("lelantos:claim-links:v1") ?? "null")).toEqual([]);
      // Idempotent: callers run it from an effect keyed on the snapshot, so a
      // second write here would notify and re-trigger that effect forever.
      expect(pruneExpiredClaimLinks()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps serving records this tab wrote when storage refuses the write", () => {
    // Safari private mode and a spent quota both make `setItem` throw. The old
    // `write` notified anyway and the next read re-parsed the *stale* stored
    // string, so `rememberClaimLink` returned normally while the only copy of a
    // bearer key vanished — with the transfer already on its way out.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    let id = "";
    try {
      id = rememberClaimLink(input());

      const [record] = listClaimLinks(CHAIN);
      expect(record.id).toBe(id);
      expect(record.url).toBe("https://app/claim#deadbeef");
    } finally {
      setItem.mockRestore();
      // Leave mirror mode: it persists until a write lands, and the module
      // state outlives this test.
      forgetClaimLink(id);
    }
  });
});
