import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("walletDb", () => {
  it("returns the same connection across calls", async () => {
    const { walletDb } = await import("./db");

    expect(await walletDb()).toBe(await walletDb());
  });

  it("does not memoise a failed open", async () => {
    failNextOpen = new Error("transient open failure");
    const { walletDb } = await import("./db");

    await expect(walletDb()).rejects.toThrow("transient open failure");

    await expect(walletDb()).resolves.toBeDefined();
  });
});
