// @vitest-environment jsdom
// The vault is the only thing standing between a chain switch and permanently
// unrecoverable funds, so its ordering guarantees matter more than its shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as policy from "./policy";
import type { RememberClaimLinkInput } from "./store";
import * as store from "./store";

const STORAGE_KEY = "lelantos:claim-links:v1";
const CHAIN = 31337n;

const input = (over: Partial<RememberClaimLinkInput> = {}): RememberClaimLinkInput => ({
  url: "https://app/claim#deadbeef",
  chainId: CHAIN,
  assetId: 1n,
  amount: 1_000n,
  ...over,
});

/// The vault memoises its parse and latches "storage refused the write" in
/// module-level state that outlives a single test, so every test starts from
/// `resetForTest` as well as an empty `localStorage`.
const vault = { ...store, ...policy };

/// The live records on `chainId`, newest first: what the vault holds for one
/// chain at `now`.
const listFor = (chainId: bigint, now = Date.now()) =>
  vault
    .claimLinksSnapshot()
    .filter((r) => r.chainId === chainId.toString() && vault.claimLinkExpiresIn(r, now) > 0);

beforeEach(() => {
  localStorage.clear();
  store.resetForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

function readStored(): unknown {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
}

describe("vault store", () => {
  it("stores a link before it has a tx hash", () => {
    // The record is written before the transfer is broadcast, so the window in
    // which the key exists only in memory is empty. A record with no `txHash`
    // is the case that most needs recovering, not one to hide.
    vault.rememberClaimLink(input());

    const [record] = listFor(CHAIN);
    if (!record) throw new Error("no record listed");
    expect(record.url).toBe("https://app/claim#deadbeef");
    expect(record.txHash).toBeUndefined();
  });

  it("attaches the tx hash to the record it created", () => {
    const id = vault.rememberClaimLink(input());

    vault.markClaimLinkBroadcast(id, "0xabc");

    expect(listFor(CHAIN)[0]?.txHash).toBe("0xabc");
  });

  it("leaves the store alone when asked to mark a record it does not have", () => {
    vault.rememberClaimLink(input());

    vault.markClaimLinkBroadcast("not-a-record", "0xabc");

    expect(listFor(CHAIN)[0]?.txHash).toBeUndefined();
  });

  it("keeps links separate per chain", () => {
    vault.rememberClaimLink(input());
    vault.rememberClaimLink(input({ chainId: 1n }));

    expect(listFor(CHAIN)).toHaveLength(1);
    expect(listFor(1n)).toHaveLength(1);
  });

  it("forgets only the record asked for", () => {
    const keep = vault.rememberClaimLink(input());
    const drop = vault.rememberClaimLink(input({ amount: 2_000n }));

    vault.forgetClaimLink(drop);

    const ids = listFor(CHAIN).map((l) => l.id);
    expect(ids).toEqual([keep]);
  });

  it("drops records past the retention window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    vault.rememberClaimLink(input());
    expect(listFor(CHAIN)).toHaveLength(1);

    vi.setSystemTime(new Date("2026-03-01"));
    expect(listFor(CHAIN)).toHaveLength(0);
  });

  it("removes expired records from storage, not just from the answer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    vault.rememberClaimLink(input());

    vi.setSystemTime(new Date("2026-03-01"));
    // Filtered out of every view, but the spending key was still on disk.
    expect(listFor(CHAIN)).toHaveLength(0);
    expect(vault.pruneExpiredClaimLinks()).toBe(true);
    expect(readStored()).toEqual([]);

    // Idempotent: callers run this from an effect keyed on the snapshot, so a
    // second write would publish and re-trigger that effect forever.
    expect(vault.pruneExpiredClaimLinks()).toBe(false);
  });

  it("survives a corrupted store rather than throwing", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");

    expect(listFor(CHAIN)).toEqual([]);
    // And it recovers: the next write replaces the garbage.
    vault.rememberClaimLink(input());
    expect(listFor(CHAIN)).toHaveLength(1);
  });

  it("ignores entries that are not shaped like records", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ nope: true }, null, 7]));

    expect(listFor(CHAIN)).toEqual([]);
  });

  it.each([
    ["an amount that is not a decimal string", { amount: "1e3" }],
    ["a negative amount", { amount: "-1" }],
    ["a chain id that is not a decimal string", { chainId: "0x7a69" }],
    ["a non-finite timestamp", { createdAt: Number.NaN }],
  ])("rejects a record with %s", (_label, override) => {
    // The vault calls `BigInt(record.amount)` mid-render, where a throw
    // unmounts the screen holding every other link. Bad entries are refused at the
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

    expect(listFor(CHAIN)).toEqual([]);
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

    const [record] = listFor(CHAIN);
    if (!record) throw new Error("no record listed");
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
    expect(stored[0]?.id).toBe(second);
  });

  it("caps the store, keeping the newest", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    for (let i = 0; i < 55; i++) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, i));
      vault.rememberClaimLink(input({ amount: BigInt(i) }));
    }

    const links = listFor(CHAIN);
    expect(links).toHaveLength(50);
    // Newest first, and the five oldest are gone.
    expect(links[0]?.amount).toBe("54");
    expect(links.at(-1)?.amount).toBe("5");
  });
});

describe("vault store validation", () => {
  /// When the record was written, and the clock the cases read it at — inside
  /// its retention window however long after it the suite runs.
  const WRITTEN_AT = Date.UTC(2026, 0, 1);

  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(WRITTEN_AT);
  });

  const stored = {
    id: "stored",
    url: "https://app/claim#stored",
    chainId: CHAIN.toString(),
    assetId: "1",
    amount: "1000",
    createdAt: WRITTEN_AT,
    txHash: "0xabc",
  };

  it("rejects a `copiedAt` that is not a timestamp", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...stored, copiedAt: "yesterday" }]));

    expect(listFor(CHAIN)).toEqual([]);
  });
});

describe("vault store curation", () => {
  it("marks only the record copied", () => {
    const a = vault.rememberClaimLink(input());
    const b = vault.rememberClaimLink(input({ amount: 2n }));

    vault.markClaimLinkCopied(a, 42);

    const byId = new Map(listFor(CHAIN).map((r) => [r.id, r]));
    expect(byId.get(a)?.copiedAt).toBe(42);
    expect(byId.get(b)?.copiedAt).toBeUndefined();
  });

  it("ignores a copy of a record that is gone", () => {
    vault.rememberClaimLink(input());
    const before = localStorage.getItem(STORAGE_KEY);

    vault.markClaimLinkCopied("gone");

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("forgets several records in one write", () => {
    const a = vault.rememberClaimLink(input());
    const b = vault.rememberClaimLink(input({ amount: 2n }));
    const c = vault.rememberClaimLink(input({ amount: 3n }));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    vault.forgetClaimLinks([a, c]);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(listFor(CHAIN).map((r) => r.id)).toEqual([b]);
  });

  it("does not write for an empty batch", () => {
    vault.rememberClaimLink(input());
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    vault.forgetClaimLinks([]);

    expect(setItem).not.toHaveBeenCalled();
  });

  it("lists every chain oldest first for the vault", () => {
    const old = vault.rememberClaimLink(input(), 1_000);
    const other = vault.rememberClaimLink(input({ chainId: 1n }), 2_000);
    const recent = vault.rememberClaimLink(input(), 3_000);

    expect(vault.selectVaultLinks(vault.claimLinksSnapshot(), 4_000).map((r) => r.id)).toEqual([
      old,
      other,
      recent,
    ]);
  });
});
