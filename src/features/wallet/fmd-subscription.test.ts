import type { Field } from "@lelantos-org/sdk/crypto";
import { FMD_DEFAULT_GAMMA } from "@lelantos-org/sdk/fmd";
import { GAMMA_MAX, GAMMA_MIN } from "@lelantos-org/sdk/fmd-server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { maxDetectionGamma, resolveSyncStrategy } from "./fmd-subscription";

// Server responses the strategy resolver reads, driven per test.
let treeState = { leafCount: 1_000_000 };
let subscription = { gamma: 3, active: true, created: true };
let createCalls = 0;

vi.mock("@lelantos-org/sdk/fmd-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lelantos-org/sdk/fmd-server")>();
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

vi.mock("@lelantos-org/sdk/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lelantos-org/sdk/crypto")>();
  return {
    ...actual,
    cryptoContext: () => Promise.resolve({ P: {}, J: {} }),
    deriveSubscriptionToken: () => new Uint8Array(32),
  };
});

vi.mock("@lelantos-org/sdk/fmd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lelantos-org/sdk/fmd")>();
  return {
    ...actual,
    // The real encoders validate their argument shapes; the strategy resolver
    // only passes their output through to the server, so stub the hex.
    subscriptionTokenToHex: () => "aa".repeat(32),
    detectionKeyToHex: () => "bb".repeat(32),
  };
});

vi.mock("@lelantos-org/sdk/keys", () => ({
  deriveKeysFromNsk: () => Promise.resolve({ keys: { ivk: {} } }),
  detectionKeyFor: () => new Uint8Array(32),
}));

// A γ is acceptable while its expected false-positive count
// (`noteCount * 2^-γ`) stays at or above 64 decoys.
const DECOY_FLOOR = 64;

/// The server's `max_gamma_for`, transcribed from
/// `fmd-webserver/src/services/subscriptions.rs`. Integer division and
/// `ilog2` there, so it is written that way here rather than with `log2`.
function serverMaxGamma(noteCount: number): number {
  const budget = Math.floor(noteCount / DECOY_FLOOR);
  if (budget < 2) return GAMMA_MIN;
  return Math.min(Math.max(Math.floor(Math.log2(budget)), GAMMA_MIN), GAMMA_MAX);
}

describe("maxDetectionGamma", () => {
  it("returns 0 for a pool too small to hide behind", () => {
    expect(maxDetectionGamma(0)).toBe(0);
    expect(maxDetectionGamma(64)).toBe(0);
    expect(maxDetectionGamma(127)).toBe(0);
  });

  // The server clamps to GAMMA_MIN below the floor and would accept a γ=1
  // subscription at any note count, including zero. Declining is a client
  // choice: at γ=1 the match set is half the pool, so subscribing would leak
  // more than fetching everything. Pinned so it reads as intent, not drift.
  it("declines below the floor where the server would accept GAMMA_MIN", () => {
    for (const notes of [0, 1, 64, 127]) {
      expect(serverMaxGamma(notes)).toBe(GAMMA_MIN);
      expect(maxDetectionGamma(notes)).toBe(0);
    }
  });

  // Above the floor the two must not diverge: a γ over the server's ceiling is
  // a rejected POST, and one under it needlessly widens the match set.
  it("agrees with the server's ceiling at and above the floor", () => {
    for (const notes of [128, 129, 200, 255, 256, 511, 512, 999, 2048, 65_536]) {
      const expected = Math.min(serverMaxGamma(notes), FMD_DEFAULT_GAMMA);
      expect(maxDetectionGamma(notes), `${notes} notes`).toBe(expected);
    }
  });

  it("matches the cap the server reported for the live pool", () => {
    // Observed: "gamma must be <= 1 at the current note count", i.e. a pool
    // somewhere in [128, 256).
    expect(maxDetectionGamma(128)).toBe(1);
    expect(maxDetectionGamma(255)).toBe(1);
  });

  it("grows by one γ per doubling of the pool", () => {
    expect(maxDetectionGamma(256)).toBe(2);
    expect(maxDetectionGamma(512)).toBe(3);
    expect(maxDetectionGamma(1024)).toBe(4);
    expect(maxDetectionGamma(2048)).toBe(5);
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

  it("uses server-side matching when the subscription is active", async () => {
    const plan = await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    expect(plan.strategy.kind).toBe("matches");
    expect(plan.fallback).toBeUndefined();
  });

  it("falls back to the firehose when the server reports the subscription inactive", async () => {
    // `active: false` used to be logged and ignored. The resulting sync does
    // not error: `listNotes` returns an empty page, the run reports
    // `exhausted` with zero hits, and the user is shown a healthy
    // "synced just now" beside a zero balance — permanently, since the token
    // stayed in localStorage across reloads.
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
    // A token is a pure function of the wallet key and never changes, but the
    // subscription it addresses can expire server-side — so the cache is a
    // hint with a TTL, not a permanent answer.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01"));
      await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);
      expect(createCalls).toBe(1);

      vi.setSystemTime(new Date("2026-01-03"));
      await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

      expect(createCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  /// A read must not disturb the entry it read.
  ///
  /// The deadline is drawn once, at write. Jittering the TTL at the comparison
  /// instead makes `get` a coin flip near the boundary — the same entry and the
  /// same clock giving two different answers. The practical cost is small, since
  /// a re-registration rewrites the entry and the flapping stops, but a cache
  /// lookup that is not a function of its inputs is not something to reason
  /// about.
  it("leaves the stored entry untouched when reading it", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

      const [key] = Object.keys(localStorage);
      const written = localStorage.getItem(key);

      // Comfortably inside even the shortest jittered lifetime (24h − 20%), so
      // the entry is unambiguously live and every read must agree.
      vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      const answers = new Set<string>();
      for (let i = 0; i < 25; i += 1) {
        answers.add(JSON.stringify(await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR)));
      }

      expect(answers.size).toBe(1);
      expect(localStorage.getItem(key)).toBe(written);
      expect(createCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("spreads the re-confirm deadline across wallets", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const deadlines = new Set<number>();
      for (let i = 0; i < 40; i += 1) {
        localStorage.clear();
        await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);
        const [key] = Object.keys(localStorage);
        deadlines.add(JSON.parse(localStorage.getItem(key) as string).expiresAt);
      }

      // An un-jittered TTL would put every wallet on the same daily tick.
      expect(deadlines.size).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes the firehose without subscribing when the pool is below the decoy floor", async () => {
    treeState = { leafCount: 10 };

    const plan = await resolveSyncStrategy("http://fmd", 1n, nsk, ADDR);

    expect(plan.strategy.kind).toBe("full");
    expect(plan.fallback).toBe("poolTooSmall");
    expect(createCalls).toBe(0);
  });
});
