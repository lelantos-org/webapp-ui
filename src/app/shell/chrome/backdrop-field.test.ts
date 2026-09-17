import { describe, expect, it, vi } from "vitest";
import { BackdropField, type FieldContext, MAX_NODES } from "./backdrop-field";
import { buildPalette } from "./backdrop-palette";

const PALETTE = buildPalette([10, 20, 30]);

function seededRandom(): () => number {
  let i = 0;
  const ramp = [0.1, 0.9, 0.35, 0.6, 0.05, 0.75, 0.5, 0.25];
  return () => ramp[i++ % ramp.length]!;
}

function field(w = 1440, h = 900): BackdropField {
  const f = new BackdropField(PALETTE, seededRandom());
  f.resize(w, h);
  return f;
}

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
    const clamped = field();
    const huge = field();
    clamped.advance(48);
    huge.advance(10 * 60_000);

    const a = recordingContext();
    const b = recordingContext();
    clamped.draw(a.ctx);
    huge.draw(b.ctx);
    expect(b.calls.lineTo).toBe(a.calls.lineTo);
  });

  it("spawns pulses on a schedule and retires them", () => {
    const f = field();
    expect(f.pulseCount).toBe(0);

    for (let i = 0; i < 70; i++) f.advance(40);
    expect(f.pulseCount).toBeGreaterThan(0);

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

    expect(calls.stroke).toBeLessThanOrEqual(10 + f.pulseCount);
    expect(calls.fill).toBe(1);
  });

  it("does not rebuild the style ramps per frame", () => {
    const f = field();
    for (let i = 0; i < 20; i++) f.advance(40);

    const spy = vi.spyOn(Array, "from");
    const { ctx } = recordingContext();
    f.draw(ctx);
    expect(spy).not.toHaveBeenCalled();
  });

  it("paints an empty field without touching a node path", () => {
    const f = new BackdropField(PALETTE, seededRandom());
    const { ctx, calls } = recordingContext();
    f.draw(ctx);
    expect(calls.arc).toBe(0);
    expect(calls.stroke).toBe(0);
  });
});
