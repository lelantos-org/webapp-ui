// The pool decides whether a produced value is adopted or disposed, and it is
// the only thing standing between a superseded wallet build and a leaked pool
// of wasm-holding workers. Its invariant is to dispose exactly when no caller
// adopted, and each case below covers one way that can fail.

import { describe, expect, it, vi } from "vitest";
import { deferred } from "@/test/harness";
import { createSharedWorkPool } from "./build-pool";

const take = async () => true;
const decline = async () => false;

describe("createSharedWorkPool", () => {
  it("does not dispose a value the caller adopted", async () => {
    const dispose = vi.fn();
    const pool = createSharedWorkPool<string>(dispose);

    await pool.run("k", async () => "value", take);

    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposes a value the only caller declined", async () => {
    const dispose = vi.fn();
    const pool = createSharedWorkPool<string>(dispose);

    await pool.run("k", async () => "value", decline);

    expect(dispose).toHaveBeenCalledExactlyOnceWith("value");
  });

  it("runs the work once for callers that join the same key", async () => {
    const make = vi.fn(async () => "value");
    const pool = createSharedWorkPool<string>(vi.fn());

    await Promise.all([pool.run("k", make, take), pool.run("k", make, take)]);

    expect(make).toHaveBeenCalledOnce();
  });

  it("keeps a shared value when one caller declines and another adopts", async () => {
    // The StrictMode case: the torn-down pass declines, the live pass adopts.
    // Disposing on "my caller declined" alone frees the value the survivor is
    // about to use.
    const dispose = vi.fn();
    const pool = createSharedWorkPool<string>(dispose);
    const work = deferred<string>();

    const declined = pool.run("k", () => work.promise, decline);
    const adopted = pool.run("k", () => work.promise, take);
    work.resolve("value");
    await Promise.all([declined, adopted]);

    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposes only after every caller has declined", async () => {
    const dispose = vi.fn();
    const pool = createSharedWorkPool<string>(dispose);
    const work = deferred<string>();

    const first = pool.run("k", () => work.promise, decline);
    const second = pool.run("k", () => work.promise, decline);
    work.resolve("value");
    await Promise.all([first, second]);

    expect(dispose).toHaveBeenCalledExactlyOnceWith("value");
  });

  it("does not dispose when the work itself failed", async () => {
    // Nothing was produced, so there is nothing holding workers.
    const dispose = vi.fn();
    const pool = createSharedWorkPool<string>(dispose);

    await expect(
      pool.run(
        "k",
        async () => {
          throw new Error("rpc down");
        },
        take,
      ),
    ).rejects.toThrow("rpc down");

    expect(dispose).not.toHaveBeenCalled();
  });

  it("propagates a failure to every caller sharing the work", async () => {
    const pool = createSharedWorkPool<string>(vi.fn());
    const work = deferred<string>();

    const first = pool.run("k", () => work.promise, take);
    const second = pool.run("k", () => work.promise, take);
    work.reject(new Error("rpc down"));

    await expect(first).rejects.toThrow("rpc down");
    await expect(second).rejects.toThrow("rpc down");
  });

  it("starts fresh work once the previous round has fully drained", async () => {
    const make = vi.fn(async () => "value");
    const pool = createSharedWorkPool<string>(vi.fn());

    await pool.run("k", make, take);
    await pool.run("k", make, take);

    expect(make).toHaveBeenCalledTimes(2);
  });

  it("keeps separate keys separate", async () => {
    const make = vi.fn(async () => "value");
    const pool = createSharedWorkPool<string>(vi.fn());

    await Promise.all([pool.run("a", make, take), pool.run("b", make, take)]);

    expect(make).toHaveBeenCalledTimes(2);
  });

  it("disposes a value whose adopter threw while deciding", async () => {
    // `adopt` doing the deciding means it can also fail. The value still exists
    // and still holds resources, so it cannot simply be dropped.
    const dispose = vi.fn();
    const pool = createSharedWorkPool<string>(dispose);

    await expect(
      pool.run(
        "k",
        async () => "value",
        async () => {
          throw new Error("adopt blew up");
        },
      ),
    ).rejects.toThrow("adopt blew up");

    expect(dispose).toHaveBeenCalledExactlyOnceWith("value");
  });
});
