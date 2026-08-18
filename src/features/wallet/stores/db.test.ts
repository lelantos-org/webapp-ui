// The shared connection is memoised for the tab's lifetime, so what gets
// memoised matters: a cached *rejection* is indistinguishable from a permanent
// failure, and the app has no way back from it short of a reload.

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/// Set to make the next `openDB` reject; consumed on use.
let failNextOpen: Error | undefined;

vi.mock("idb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("idb")>();
  return {
    ...actual,
    openDB: (...args: Parameters<typeof actual.openDB>) => {
      if (failNextOpen) {
        const e = failNextOpen;
        failNextOpen = undefined;
        return Promise.reject(e);
      }
      return actual.openDB(...args);
    },
  };
});

beforeEach(() => {
  failNextOpen = undefined;
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("walletDb", () => {
  it("returns the same connection across calls", async () => {
    const { walletDb } = await import("./db");

    expect(await walletDb()).toBe(await walletDb());
  });

  it("does not memoise a failed open", async () => {
    // `dbp ??= openDB(...)` cached the rejected promise, so one transient
    // failure — a blocked cross-tab upgrade, a connection the browser killed —
    // made every later call re-reject on an error that had already passed.
    failNextOpen = new Error("transient open failure");
    const { walletDb } = await import("./db");

    await expect(walletDb()).rejects.toThrow("transient open failure");

    // The next call must attempt a fresh open rather than replay the rejection.
    await expect(walletDb()).resolves.toBeDefined();
  });
});
