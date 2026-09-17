import { type Field, FMD_DEFAULT_GAMMA } from "@lelantos-org/sdk/primitives";
import { GAMMA_MAX, GAMMA_MIN } from "@lelantos-org/sdk/services";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maxDetectionGamma, resolveSyncStrategy } from "./fmd-subscription";

let treeState = { leafCount: 1_000_000 };
let subscription = { gamma: 3, active: true, created: true };
let createCalls = 0;

vi.mock("@lelantos-org/sdk/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lelantos-org/sdk/services")>();
  return {
    ...actual,
    FmdClient: class {
      fetchTreeState() {
        return Promise.resolve(treeState);
      }
      createSubscription() {
        createCalls += 1;
        return Promise.resolve(subscription);
      }
    },
  };
});

vi.mock("@lelantos-org/sdk/primitives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lelantos-org/sdk/primitives")>();
  return {
    ...actual,
    cryptoContext: () => Promise.resolve({ P: {}, J: {} }),
    deriveSubscriptionToken: () => new Uint8Array(32),
    subscriptionTokenToHex: () => "aa".repeat(32),
    detectionKeyToHex: () => "bb".repeat(32),
    deriveKeysFromNsk: () => Promise.resolve({ keys: { ivk: {} } }),
    detectionKeyFor: () => new Uint8Array(32),
  };
});

const DECOY_FLOOR = 64;

/// The server's `max_gamma_for` (fmd-webserver `subscriptions.rs`), transcribed with integer maths.
function serverMaxGamma(noteCount: number): number {
  const budget = Math.floor(noteCount / DECOY_FLOOR);
  if (budget < 2) return GAMMA_MIN;
  return Math.min(Math.max(Math.floor(Math.log2(budget)), GAMMA_MIN), GAMMA_MAX);
}

describe("maxDetectionGamma", () => {
  // Deliberately stricter than the server: at γ=1 a subscription leaks more than the firehose.
  it("declines below the floor where the server would accept GAMMA_MIN", () => {
    for (const notes of [0, 1, 64, 127]) {
      expect(serverMaxGamma(notes)).toBe(GAMMA_MIN);
      expect(maxDetectionGamma(notes)).toBe(0);
    }
  });

  it("agrees with the server's ceiling at and above the floor", () => {
    for (const notes of [128, 129, 200, 255, 256, 511, 512, 999, 2048, 65_536]) {
      const expected = Math.min(serverMaxGamma(notes), FMD_DEFAULT_GAMMA);
      expect(maxDetectionGamma(notes), `${notes} notes`).toBe(expected);
    }
  });

  it("grows by one γ per doubling of the pool", () => {
    expect([128, 255, 256, 512, 1024, 2048].map(maxDetectionGamma)).toEqual([1, 1, 2, 3, 4, 5]);
  });

  it("never exceeds the sender's γ, however large the pool", () => {
    expect(maxDetectionGamma(1_000_000)).toBe(FMD_DEFAULT_GAMMA);
    expect(maxDetectionGamma(Number.MAX_SAFE_INTEGER)).toBe(FMD_DEFAULT_GAMMA);
  });

  it("keeps the decoy floor at every value it returns", () => {
    for (const notes of [128, 200, 256, 999, 2048, 100_000]) {
      const gamma = maxDetectionGamma(notes);
      if (gamma < GAMMA_MIN) continue;
      expect(notes / 2 ** gamma, `${notes} notes at gamma ${gamma}`).toBeGreaterThanOrEqual(
        DECOY_FLOOR,
      );
    }
  });
});

describe("resolveSyncStrategy", () => {
  const nsk = 1n as unknown as Field;
  const ADDR = "0xabcdefabcdefabcdefabcdefabcdefabcdefabc1";

  beforeEach(() => {
    localStorage.clear();
    treeState = { leafCount: 1_000_000 };
    subscription = { gamma: 3, active: true, created: true };
    createCalls = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses server-side matching when the subscription is active", async () => {
    const plan = await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    expect(plan.strategy.kind).toBe("matches");
    expect(plan.fallback).toBeUndefined();
  });

  it("falls back to the firehose when the server reports the subscription inactive", async () => {
    subscription = { gamma: 3, active: false, created: true };

    const plan = await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    expect(plan.strategy.kind).toBe("full");
    expect(plan.fallback).toBe("unavailable");
  });

  it("does not cache a token whose subscription came back inactive", async () => {
    subscription = { gamma: 3, active: false, created: true };
    await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    subscription = { gamma: 3, active: true, created: false };
    const plan = await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    expect(plan.strategy.kind).toBe("matches");
    expect(createCalls).toBe(2);
  });

  it("reuses a freshly confirmed token without re-registering", async () => {
    await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);
    await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    expect(createCalls).toBe(1);
  });

  it("re-confirms a token once the cache entry ages out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);
    expect(createCalls).toBe(1);

    vi.setSystemTime(new Date("2026-01-03"));
    await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    expect(createCalls).toBe(2);
  });

  it("leaves the stored entry untouched when reading it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    const [key = ""] = Object.keys(localStorage);
    const written = localStorage.getItem(key);

    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const answers = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      answers.add(JSON.stringify(await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR)));
    }

    expect(answers.size).toBe(1);
    expect(localStorage.getItem(key)).toBe(written);
    expect(createCalls).toBe(1);
  });

  it("spreads the re-confirm deadline across wallets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const deadlines = new Set<number>();
    for (let i = 0; i < 40; i += 1) {
      localStorage.clear();
      await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);
      const [key = ""] = Object.keys(localStorage);
      deadlines.add(JSON.parse(localStorage.getItem(key) as string).expiresAt);
    }

    expect(deadlines.size).toBeGreaterThan(1);
  });

  it("takes the firehose without subscribing when the pool is below the decoy floor", async () => {
    treeState = { leafCount: 10 };

    const plan = await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    expect(plan.strategy.kind).toBe("full");
    expect(plan.fallback).toBe("poolTooSmall");
    expect(createCalls).toBe(0);
  });
});
