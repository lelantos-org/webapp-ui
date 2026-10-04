import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

let failNextOpen: Error | undefined;
/// When set, the next open reports `blocked` and stays pending until `release` is called.
let blockNextOpen: { release?: () => void } | undefined;

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
      if (blockNextOpen) {
        const held = blockNextOpen;
        blockNextOpen = undefined;
        const [name, version, callbacks] = args;
        return new Promise((resolve, reject) => {
          held.release = () => actual.openDB(name, version, callbacks).then(resolve, reject);
          queueMicrotask(() =>
            callbacks?.blocked?.(0, version ?? null, new Event("blocked") as never),
          );
        });
      }
      return actual.openDB(...args);
    },
  };
});

beforeEach(() => {
  failNextOpen = undefined;
  blockNextOpen = undefined;
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

  it("tells the caller when another tab blocks the open, and recovers once it lets go", async () => {
    const held: { release?: () => void } = {};
    blockNextOpen = held;
    const { walletDb } = await import("./db");

    await expect(walletDb()).rejects.toThrow(/Another tab is using an older version/);

    // The abandoned request completing later must not strand an open handle or poison the next call.
    held.release?.();
    await expect(walletDb()).resolves.toBeDefined();
  });
});
