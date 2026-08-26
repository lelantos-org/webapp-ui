// The field is decorative, so appearance is not asserted. These cover the cost
// properties instead: bounded node count, bounded pulse list, no per-frame
// allocation, one batched stroke per alpha tier. A regression in any of them
// raises the render cost of an ambient background without changing how it
// looks, so none would be caught by a screenshot.

import { describe, expect, it, vi } from "vitest";
import { BackdropField, buildPalette, type FieldContext, MAX_NODES } from "./backdrop-field";

const PALETTE = buildPalette([10, 20, 30]);

/// Deterministic stand-in for `Math.random`, cycling a fixed ramp so node
/// placement and pulse targets are reproducible across runs.
function seededRandom(): () => number {
  let i = 0;
  const ramp = [0.1, 0.9, 0.35, 0.6, 0.05, 0.75, 0.5, 0.25];
  return () => ramp[i++ % ramp.length];
}

function field(w = 1440, h = 900): BackdropField {
  const f = new BackdropField(PALETTE, seededRandom());
  f.resize(w, h);
  return f;
}

/// Records the calls `draw` makes, so a test can count strokes without a canvas.
function recordingContext() {
  const calls = { stroke: 0, fill: 0, beginPath: 0, clearRect: 0, arc: 0, lineTo: 0 };
  const ctx = {
    clearRect: () => {
      calls.clearRect++;
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    beginPath: () => {
      calls.beginPath++;
    },
    moveTo: () => {},
    lineTo: () => {
      calls.lineTo++;
    },
    arc: () => {
      calls.arc++;
    },
    stroke: () => {
      calls.stroke++;
    },
    fill: () => {
      calls.fill++;
    },
    strokeStyle: "" as string | CanvasGradient | CanvasPattern,
    fillStyle: "" as string | CanvasGradient | CanvasPattern,
    lineWidth: 0,
  };
  return { ctx: ctx as FieldContext, calls };
}

describe("BackdropField sizing", () => {
  it("caps the node count however large the viewport", () => {
    expect(field(8000, 4000).size).toBe(MAX_NODES);
  });

  it("keeps a floor on a small viewport", () => {
    expect(field(320, 200).size).toBeGreaterThanOrEqual(24);
  });

  it("retains nodes across a resize rather than reseeding", () => {
    const f = field(1000, 1000);
    const before = f.size;
    f.resize(1100, 1000);
    // The count moves only by what the new area requires.
    expect(f.size).toBeGreaterThanOrEqual(Math.min(before, MAX_NODES) - 1);
  });
});

describe("BackdropField.advance", () => {
  it("is a no-op for a non-positive dt", () => {
    const f = field();
    const { ctx, calls } = recordingContext();
    f.advance(0);
    f.advance(-16);
    f.draw(ctx);
    expect(calls.clearRect).toBe(1);
    expect(f.pulseCount).toBe(0);
  });

  it("clamps a large dt so a resumed loop cannot displace the field", () => {
    // Covers resuming after a hidden tab or a parked loop, where the true
    // elapsed time would move every node across the viewport at once.
    const clamped = field();
    const huge = field();
    clamped.advance(48);
    huge.advance(10 * 60_000);

    const a = recordingContext();
    const b = recordingContext();
    clamped.draw(a.ctx);
    huge.draw(b.ctx);
    // Same seed and same field, so an unclamped advance diverges in link
    // count. Identical geometry confirms the clamp applied.
    expect(b.calls.lineTo).toBe(a.calls.lineTo);
  });

  it("spawns pulses on a schedule and retires them", () => {
    const f = field();
    expect(f.pulseCount).toBe(0);

    // One pulse per PULSE_EVERY_MS, with dt clamped, so advance in steps.
    for (let i = 0; i < 70; i++) f.advance(40);
    expect(f.pulseCount).toBeGreaterThan(0);

    // The list drains rather than growing without bound.
    for (let i = 0; i < 400; i++) f.advance(40);
    expect(f.pulseCount).toBeLessThanOrEqual(2);
  });
});

describe("BackdropField.draw", () => {
  it("strokes at most once per alpha tier instead of once per link", () => {
    const f = field();
    for (let i = 0; i < 20; i++) f.advance(40);
    const { ctx, calls } = recordingContext();
    f.draw(ctx);

    // Batching invariant: at most 10 link tiers plus one ring per live pulse.
    // Stroking per link would raise this into the hundreds.
    expect(calls.stroke).toBeLessThanOrEqual(10 + f.pulseCount);
    // All dots go into a single path.
    expect(calls.fill).toBe(1);
  });

  it("does not rebuild the style ramps per frame", () => {
    // Narrow proxy for the no-allocation property of the draw path: catches
    // `buildPalette`'s work moving into `draw`, which would introduce GC
    // pauses visible as stutter.
    const f = field();
    for (let i = 0; i < 20; i++) f.advance(40);

    const spy = vi.spyOn(Array, "from");
    const { ctx } = recordingContext();
    f.draw(ctx);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("paints an empty field without touching a node path", () => {
    const f = new BackdropField(PALETTE, seededRandom());
    const { ctx, calls } = recordingContext();
    f.draw(ctx);
    expect(calls.arc).toBe(0);
    expect(calls.stroke).toBe(0);
  });
});

describe("buildPalette", () => {
  it("builds one style per tier at increasing alpha", () => {
    const p = buildPalette([1, 2, 3]);
    expect(p.link).toHaveLength(10);
    expect(p.pulse).toHaveLength(10);
    expect(p.link[0]).toContain("rgba(1, 2, 3,");
    // Monotonic ramp; index 0 is the faintest.
    const alpha = (s: string) => Number(s.slice(s.lastIndexOf(",") + 1, -1));
    expect(alpha(p.link[0])).toBeLessThan(alpha(p.link[9]));
  });
});
