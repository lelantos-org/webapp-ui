// Simulation behind `<Backdrop />`: a drifting field of nodes wired to their
// near neighbours, with periodic expanding pulses.
//
// Contains no React, DOM or `requestAnimationFrame` bindings. The component
// schedules frames; this module defines their contents. `advance` depends only
// on `dt` and the injected RNG, so a field can be driven deterministically
// without a canvas or a timer.

/** One drifting node. */
interface Node {
  x: number;
  y: number;
  /** Heading in radians; speed is constant, only the heading curls. */
  a: number;
  /** Per-node phase, so the curl does not synchronise across the field. */
  phase: number;
  /** Dot radius. */
  r: number;
}

/** An expanding ring, retired once `t` reaches 1. */
interface Pulse {
  x: number;
  y: number;
  /** Progress, 0 to 1. */
  t: number;
}

/** px² of viewport per node. */
const NODE_AREA = 40_000;
export const MAX_NODES = 56;
const MIN_NODES = 24;
/** Nodes closer than this are joined by a link. */
const LINK_DIST = 150;
const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
/** px per ms. */
const SPEED = 0.05;
/** Radians per ms of heading drift. */
const CURL = 0.00022;
/** Radians per ms of curl-phase advance. */
const CURL_PHASE = 0.0004;
/** Upper bound on a frame delta, so a stalled frame cannot displace nodes far. */
const MAX_DT = 48;
const PULSE_EVERY_MS = 2600;
const PULSE_MS = 1600;
const PULSE_R = 46;
const LINK_ALPHA = 0.14;
const NODE_ALPHA = 0.3;
const PULSE_ALPHA = 0.28;
/** Alpha quantisation steps: fewer draw calls, no visible banding. */
const TIERS = 10;
/** px of pointer-follow at the field's edge. */
const PARALLAX = 14;
/** Per-ms approach rate toward the pointer target. */
const PARALLAX_EASE = 0.0035;

/**
 * Pre-built `rgba()` strings, one per alpha tier.
 *
 * Held for the lifetime of the field: the draw path must not allocate, since
 * per-frame string construction introduces GC pauses visible as stutter.
 */
export interface FieldPalette {
  /** Link stroke per tier, index 0 faintest. */
  link: readonly string[];
  node: string;
  /** Pulse stroke per tier, index 0 faintest. */
  pulse: readonly string[];
}

export function buildPalette([r, g, b]: readonly [number, number, number]): FieldPalette {
  const ramp = (peak: number) =>
    Array.from(
      { length: TIERS },
      (_, i) => `rgba(${r}, ${g}, ${b}, ${(((i + 1) / TIERS) * peak).toFixed(4)})`,
    );
  return {
    link: ramp(LINK_ALPHA),
    node: `rgba(${r}, ${g}, ${b}, ${NODE_ALPHA})`,
    pulse: ramp(PULSE_ALPHA),
  };
}

/** Node count for a viewport, scaled by area and bounded at both ends. */
function nodeCountFor(w: number, h: number): number {
  return Math.max(MIN_NODES, Math.min(MAX_NODES, Math.round((w * h) / NODE_AREA)));
}

/**
 * Subset of the 2D context used by `draw`; the surface a stub must provide.
 *
 * Picked from `CanvasRenderingContext2D` rather than restated: `strokeStyle`
 * and `fillStyle` are mutable, so TypeScript compares them invariantly and a
 * declaration narrowing them to `string` is not assignable.
 */
export type FieldContext = Pick<
  CanvasRenderingContext2D,
  | "clearRect"
  | "save"
  | "restore"
  | "translate"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "arc"
  | "stroke"
  | "fill"
  | "strokeStyle"
  | "fillStyle"
  | "lineWidth"
>;

export class BackdropField {
  private nodes: Node[] = [];
  private pulses: Pulse[] = [];
  private w = 0;
  private h = 0;
  private sincePulse = 0;

  /** Eased parallax offset, and the target it approaches. */
  private px = 0;
  private py = 0;
  private targetX = 0;
  private targetY = 0;

  /**
   * Scratch buffers for one frame of links, sized for the node cap and
   * allocated once. The neighbour sweep fills them; the draw pass replays them
   * per tier. Holds a frame to a single O(n²) pass with no allocation.
   */
  private readonly linkXY = new Float32Array(((MAX_NODES * (MAX_NODES - 1)) / 2) * 4);
  private readonly linkTier = new Uint8Array((MAX_NODES * (MAX_NODES - 1)) / 2);
  private linkCount = 0;

  constructor(
    private readonly palette: FieldPalette,
    private readonly random: () => number = Math.random,
  ) {}

  /** Live node count. */
  get size(): number {
    return this.nodes.length;
  }

  /** Rings currently animating. */
  get pulseCount(): number {
    return this.pulses.length;
  }

  /**
   * Fit the field to a new viewport.
   *
   * Rescales existing nodes and adjusts the count rather than reseeding, so a
   * resize does not reshuffle the field.
   */
  resize(w: number, h: number): void {
    const prevW = this.w;
    const prevH = this.h;
    this.w = w;
    this.h = h;

    if (this.nodes.length === 0) {
      this.nodes = Array.from({ length: nodeCountFor(w, h) }, () => this.makeNode());
      return;
    }
    if (prevW > 0 && prevH > 0) {
      const sx = w / prevW;
      const sy = h / prevH;
      for (const n of this.nodes) {
        n.x *= sx;
        n.y *= sy;
      }
    }
    const want = nodeCountFor(w, h);
    while (this.nodes.length < want) this.nodes.push(this.makeNode());
    if (this.nodes.length > want) this.nodes.length = want;
  }

  /** Point the parallax at a viewport coordinate. The field eases toward it. */
  aimAt(clientX: number, clientY: number): void {
    if (this.w === 0 || this.h === 0) return;
    this.targetX = (clientX / this.w - 0.5) * -2 * PARALLAX;
    this.targetY = (clientY / this.h - 0.5) * -2 * PARALLAX;
  }

  /**
   * Advance by `dtMs`, clamped to `MAX_DT` so a resume after a long pause
   * cannot displace the field by an arbitrary distance.
   */
  advance(dtMs: number): void {
    const dt = Math.min(MAX_DT, dtMs);
    if (dt <= 0) return;

    // Nodes wrap one link-distance outside the viewport, so a link never
    // appears at the edge with one end already on screen.
    const wrap = LINK_DIST;
    for (const n of this.nodes) {
      // Curling the heading rather than reflecting at the edges keeps motion
      // continuous and avoids a node reversing in place.
      n.phase += dt * CURL_PHASE;
      n.a += Math.sin(n.phase) * CURL * dt;
      n.x += Math.cos(n.a) * SPEED * dt;
      n.y += Math.sin(n.a) * SPEED * dt;
      if (n.x < -wrap) n.x = this.w + wrap;
      else if (n.x > this.w + wrap) n.x = -wrap;
      if (n.y < -wrap) n.y = this.h + wrap;
      else if (n.y > this.h + wrap) n.y = -wrap;
    }

    // Exponential approach: frame-rate independent, so the motion matches at
    // 30, 60 and 120Hz.
    const k = 1 - Math.exp(-PARALLAX_EASE * dt);
    this.px += (this.targetX - this.px) * k;
    this.py += (this.targetY - this.py) * k;

    this.sincePulse += dt;
    if (this.sincePulse >= PULSE_EVERY_MS && this.nodes.length > 0) {
      this.sincePulse = 0;
      const n = this.nodes[Math.floor(this.random() * this.nodes.length)];
      this.pulses.push({ x: n.x, y: n.y, t: 0 });
    }
    if (this.pulses.length > 0) {
      for (const p of this.pulses) p.t = Math.min(1, p.t + dt / PULSE_MS);
      this.pulses = this.pulses.filter((p) => p.t < 1);
    }
  }

  /** Paint the current state. Allocates nothing. */
  draw(ctx: FieldContext): void {
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(this.px, this.py);

    this.sweepLinks();
    this.strokeLinks(ctx);
    this.fillNodes(ctx);
    this.strokePulses(ctx);

    ctx.restore();
  }

  private makeNode(): Node {
    return {
      x: this.random() * this.w,
      y: this.random() * this.h,
      a: this.random() * Math.PI * 2,
      phase: this.random() * Math.PI * 2,
      r: 0.9 + this.random() * 1.3,
    };
  }

  /** Single O(n²) neighbour pass into the scratch buffers. */
  private sweepLinks(): void {
    this.linkCount = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK_DIST_SQ) continue;
        const fade = 1 - Math.sqrt(d2) / LINK_DIST;
        const o = this.linkCount * 4;
        this.linkXY[o] = a.x;
        this.linkXY[o + 1] = a.y;
        this.linkXY[o + 2] = b.x;
        this.linkXY[o + 3] = b.y;
        this.linkTier[this.linkCount] = tierOf(fade);
        this.linkCount++;
      }
    }
  }

  /** One batched path per alpha tier, rather than one stroke per link. */
  private strokeLinks(ctx: FieldContext): void {
    ctx.lineWidth = 1;
    for (let tier = 0; tier < TIERS; tier++) {
      let opened = false;
      for (let k = 0; k < this.linkCount; k++) {
        if (this.linkTier[k] !== tier) continue;
        if (!opened) {
          ctx.beginPath();
          opened = true;
        }
        const o = k * 4;
        ctx.moveTo(this.linkXY[o], this.linkXY[o + 1]);
        ctx.lineTo(this.linkXY[o + 2], this.linkXY[o + 3]);
      }
      if (opened) {
        ctx.strokeStyle = this.palette.link[tier];
        ctx.stroke();
      }
    }
  }

  /** All dots in a single path; they share one alpha. */
  private fillNodes(ctx: FieldContext): void {
    ctx.fillStyle = this.palette.node;
    ctx.beginPath();
    for (const n of this.nodes) {
      ctx.moveTo(n.x + n.r, n.y);
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  private strokePulses(ctx: FieldContext): void {
    ctx.lineWidth = 1.2;
    for (const p of this.pulses) {
      // Ease-out radius against ease-in alpha, so the ring dissolves rather
      // than disappearing at full size.
      const alpha = (1 - p.t) ** 2;
      if (alpha <= 0) continue;
      const grow = 1 - (1 - p.t) ** 3;
      ctx.strokeStyle = this.palette.pulse[tierOf(alpha)];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + grow * PULSE_R, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** Quantise a 0..1 alpha onto the palette ramp. */
function tierOf(alpha: number): number {
  return Math.min(TIERS - 1, Math.floor(alpha * TIERS));
}
