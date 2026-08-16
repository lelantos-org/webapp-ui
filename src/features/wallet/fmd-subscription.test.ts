import { FMD_DEFAULT_GAMMA } from "@lelantos-org/sdk/fmd";
import { GAMMA_MAX, GAMMA_MIN } from "@lelantos-org/sdk/fmd-server";
import { describe, expect, it } from "vitest";
import { maxDetectionGamma } from "./fmd-subscription";

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
