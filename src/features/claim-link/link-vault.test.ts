// The vault is the only thing standing between a chain switch and permanently
// unrecoverable funds, so its ordering guarantees matter more than its shape.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RememberClaimLinkInput } from "./link-vault";

const STORAGE_KEY = "lelantos:claim-links:v1";
const CHAIN = 31337n;

const input = (over: Partial<RememberClaimLinkInput> = {}): RememberClaimLinkInput => ({
  url: "https://app/claim#deadbeef",
  chainId: CHAIN,
  assetId: 1n,
  amount: 1_000n,
  ...over,
});

/// A fresh copy of the module per test.
///
/// The vault memoises its parse and latches "storage refused the write" in
/// module-level state that outlives a single test. Clearing `localStorage`
/// alone left the next test reading one of those caches, so a test could pass
/// or fail on where it sat in the file. Re-importing is the only reset that
/// covers every one of them at once.
let vault: typeof import("./link-vault");

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  vault = await import("./link-vault");
});

function readStored(): unknown {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
}

describe("link-vault", () => {
  it("stores a link before it has a tx hash", () => {
    // The record is written before the transfer is broadcast, so the window in
    // which the key exists only in memory is empty. A record with no `txHash`
    // is the case that most needs recovering, not one to hide.
    vault.rememberClaimLink(input());

    const [record] = vault.listClaimLinks(CHAIN);
    expect(record.url).toBe("https://app/claim#deadbeef");
    expect(record.txHash).toBeUndefined();
  });

  it("attaches the tx hash to the record it created", () => {
    const id = vault.rememberClaimLink(input());

    vault.markClaimLinkBroadcast(id, "0xabc");

    expect(vault.listClaimLinks(CHAIN)[0].txHash).toBe("0xabc");
  });

  it("leaves the store alone when asked to mark a record it does not have", () => {
    vault.rememberClaimLink(input());

    vault.markClaimLinkBroadcast("not-a-record", "0xabc");

    expect(vault.listClaimLinks(CHAIN)[0].txHash).toBeUndefined();
  });

  it("keeps links separate per chain", () => {
    vault.rememberClaimLink(input());
    vault.rememberClaimLink(input({ chainId: 1n }));

    expect(vault.listClaimLinks(CHAIN)).toHaveLength(1);
    expect(vault.listClaimLinks(1n)).toHaveLength(1);
  });

  it("forgets only the record asked for", () => {
    const keep = vault.rememberClaimLink(input());
    const drop = vault.rememberClaimLink(input({ amount: 2_000n }));

    vault.forgetClaimLink(drop);

    const ids = vault.listClaimLinks(CHAIN).map((l) => l.id);
    expect(ids).toEqual([keep]);
  });

  it("drops records past the retention window", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01"));
      vault.rememberClaimLink(input());
      expect(vault.listClaimLinks(CHAIN)).toHaveLength(1);

      vi.setSystemTime(new Date("2026-03-01"));
      expect(vault.listClaimLinks(CHAIN)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes expired records from storage, not just from the answer", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01"));
      vault.rememberClaimLink(input());

      vi.setSystemTime(new Date("2026-03-01"));
      // Filtered out of every view, but the spending key was still on disk.
      expect(vault.listClaimLinks(CHAIN)).toHaveLength(0);
      expect(vault.pruneExpiredClaimLinks()).toBe(true);
      expect(readStored()).toEqual([]);

      // Idempotent: callers run this from an effect keyed on the snapshot, so a
      // second write would publish and re-trigger that effect forever.
      expect(vault.pruneExpiredClaimLinks()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("survives a corrupted store rather than throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    expect(vault.listClaimLinks(CHAIN)).toEqual([]);
    // And it recovers: the next write replaces the garbage.
    vault.rememberClaimLink(input());
    expect(vault.listClaimLinks(CHAIN)).toHaveLength(1);
  });

  it("ignores entries that are not shaped like records", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ nope: true }, null, 7]));

    expect(vault.listClaimLinks(CHAIN)).toEqual([]);
  });

  it.each([
    ["an amount that is not a decimal string", { amount: "1e3" }],
    ["a negative amount", { amount: "-1" }],
    ["a chain id that is not a decimal string", { chainId: "0x7a69" }],
    ["a non-finite timestamp", { createdAt: Number.NaN }],
  ])("rejects a record with %s", (_label, override) => {
    // `UnclaimedLinks` calls `BigInt(record.amount)` mid-render, where a throw
    // unmounts the tab holding every other link. Bad entries are refused at the
    // boundary instead of reaching a render.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: "a",
          url: "https://app/claim#x",
          chainId: CHAIN.toString(),
          assetId: "1",
          amount: "1000",
          createdAt: 1_767_225_600_000,
          ...override,
        },
      ]),
    );

    expect(vault.listClaimLinks(CHAIN)).toEqual([]);
  });

  it("keeps serving records this tab wrote when storage refuses the write", () => {
    // Safari private mode and a spent quota both make `setItem` throw. The old
    // write path published anyway and the next read re-parsed the *stale*
    // stored string, so `rememberClaimLink` returned normally while the only
    // copy of a bearer key vanished — with the transfer already on its way out.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    const id = vault.rememberClaimLink(input());

    const [record] = vault.listClaimLinks(CHAIN);
    expect(record.id).toBe(id);
    expect(record.url).toBe("https://app/claim#deadbeef");
  });

  it("goes back to storage once a write lands again", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    vault.rememberClaimLink(input());
    const second = vault.rememberClaimLink(input({ amount: 2_000n }));

    setItem.mockRestore();
    // Both are on disk: the second write succeeded and carried the first
    // record — held in memory through the outage — with it.
    const stored = readStored() as { id: string }[];
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe(second);
  });

  it("caps the store, keeping the newest", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01"));
      for (let i = 0; i < 55; i++) {
        vi.setSystemTime(new Date(2026, 0, 1, 0, i));
        vault.rememberClaimLink(input({ amount: BigInt(i) }));
      }

      const links = vault.listClaimLinks(CHAIN);
      expect(links).toHaveLength(50);
      // Newest first, and the five oldest are gone.
      expect(links[0].amount).toBe("54");
      expect(links.at(-1)?.amount).toBe("5");
    } finally {
      vi.useRealTimers();
    }
  });
});
