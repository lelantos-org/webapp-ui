// The pressure must agree exactly with `normalize`: a wrong warning can cost a bearer secret.

import { beforeEach, describe, expect, it } from "vitest";
import * as policy from "./policy";
import * as store from "./store";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_767_225_600_000;

const vault = { ...store, ...policy };

/// `resetForTest` too: clearing `localStorage` does not reset the store's write-refused latch.
beforeEach(() => {
  localStorage.clear();
  store.resetForTest();
});

const remember = (createdAt: number, id: string, chainId = 31337n) =>
  vault.rememberClaimLink(
    { url: `https://app/claim#${id}`, chainId, assetId: 1n, amount: 1n },
    createdAt,
  );

const claimLinkPressure = (now: number) =>
  vault.claimLinkPressureOf(vault.claimLinksSnapshot(), now);

describe("claimLinkPressure", () => {
  it("reports an empty vault without inventing an expiry", () => {
    const p = claimLinkPressure(NOW);
    expect(p.count).toBe(0);
    expect(p.oldestExpiresIn).toBeUndefined();
    expect(p.roomLeft).toBe(p.capacity);
    expect(p.nextEvicted).toBeUndefined();
  });

  it("exposes the retention window the copy is written from", () => {
    expect(claimLinkPressure(NOW).ttlMs).toBe(7 * DAY);
  });

  it("counts down the room left as links are created", () => {
    remember(NOW, "a");
    remember(NOW, "b");
    const p = claimLinkPressure(NOW);
    expect(p.count).toBe(2);
    expect(p.roomLeft).toBe(p.capacity - 2);
  });

  it("counts every chain, because the cap does", () => {
    remember(NOW, "a", 31337n);
    remember(NOW, "b", 1n);
    expect(claimLinkPressure(NOW).count).toBe(2);
  });

  it("flags a record about to age out, while it can still be acted on", () => {
    remember(NOW - 6 * DAY, "old");
    remember(NOW, "new");
    const p = claimLinkPressure(NOW);
    expect(p.count).toBe(2);
    expect(p.expiringSoon).toBe(1);
    expect(p.oldestExpiresIn).toBeLessThanOrEqual(DAY);
  });

  it("does not count a record the TTL has already dropped", () => {
    remember(NOW - 8 * DAY, "gone");
    const p = claimLinkPressure(NOW);
    expect(p.count).toBe(0);
    expect(p.expiringSoon).toBe(0);
  });

  it("names the record the next link would drop, only once the vault is full", () => {
    const { capacity } = claimLinkPressure(NOW);
    for (let i = 0; i < capacity - 1; i++) remember(NOW - (capacity - i) * 1_000, `r${i}`);
    expect(claimLinkPressure(NOW).nextEvicted).toBeUndefined();

    remember(NOW, "last");
    const full = claimLinkPressure(NOW);
    expect(full.roomLeft).toBe(0);
    expect(full.nextEvicted?.url).toBe("https://app/claim#r0");

    remember(NOW + 1, "overflow");
    expect(vault.claimLinksSnapshot().some((r) => r.url === "https://app/claim#r0")).toBe(false);
  });
});

describe("claimLinkExpiresIn", () => {
  it("counts down to the TTL from creation", () => {
    remember(NOW - DAY, "a");
    const [record] = vault.claimLinksSnapshot();
    expect(vault.claimLinkExpiresIn(record!, NOW)).toBe(6 * DAY);
  });
});
