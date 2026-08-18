// The vault is the only thing standing between a chain switch and permanently
// unrecoverable funds, so its ordering guarantees matter more than its shape.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetClaimLink,
  listClaimLinks,
  markClaimLinkBroadcast,
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
});
