import { type FieldPalette, TIERS } from "./backdrop-palette";

interface Node {
  x: number;
  y: number;
  /// Heading, radians.
  a: number;
  phase: number;
  r: number;
}

interface Pulse {
  x: number;
  y: number;
  /// Progress, 0 to 1.
  t: number;
}

/// px² of viewport per node.
const NODE_AREA = 40_000;
export const MAX_NODES = 56;
const MIN_NODES = 24;
const LINK_DIST = 150;
const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
/// px per ms.
const SPEED = 0.05;
/// Heading drift, radians per ms.
const CURL = 0.00022;
const CURL_PHASE = 0.0004;
const MAX_DT = 48;
const PULSE_EVERY_MS = 2600;
const PULSE_MS = 1600;
const PULSE_R = 46;
/// Max pointer-follow offset, px.
const PARALLAX = 14;
const PARALLAX_EASE = 0.0035;

function nodeCountFor(w: number, h: number): number {
  return Math.max(MIN_NODES, Math.min(MAX_NODES, Math.round((w * h) / NODE_AREA)));
}

/// The 2D context surface `draw` uses; a test stub must provide it.
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

/// Canvas-free simulation of the backdrop: drifting linked nodes and pulses. Deterministic given `random`.
export class BackdropField {
  private nodes: Node[] = [];
  private pulses: Pulse[] = [];
  private w = 0;
  private h = 0;
  private sincePulse = 0;

  private px = 0;
  private py = 0;
  private targetX = 0;
  private targetY = 0;

  // Preallocated link buffers: the draw path must not allocate.
  private readonly linkXY = new Float32Array(((MAX_NODES * (MAX_NODES - 1)) / 2) * 4);
  private readonly linkTier = new Uint8Array((MAX_NODES * (MAX_NODES - 1)) / 2);
  private linkCount = 0;

  constructor(
    private readonly palette: FieldPalette,
    private readonly random: () => number = Math.random,
  ) {}

  get size(): number {
    return this.nodes.length;
  }

  get pulseCount(): number {
    return this.pulses.length;
  }

  /// Fit to a new viewport, rescaling existing nodes rather than reseeding.
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

  aimAt(clientX: number, clientY: number): void {
    if (this.w === 0 || this.h === 0) return;
    this.targetX = (clientX / this.w - 0.5) * -2 * PARALLAX;
    this.targetY = (clientY / this.h - 0.5) * -2 * PARALLAX;
  }

  /// Advance by `dtMs`, clamped to `MAX_DT`.
  advance(dtMs: number): void {
    const dt = Math.min(MAX_DT, dtMs);
    if (dt <= 0) return;

    const wrap = LINK_DIST;
    for (const n of this.nodes) {
      n.phase += dt * CURL_PHASE;
      n.a += Math.sin(n.phase) * CURL * dt;
      n.x += Math.cos(n.a) * SPEED * dt;
      n.y += Math.sin(n.a) * SPEED * dt;
      if (n.x < -wrap) n.x = this.w + wrap;
      else if (n.x > this.w + wrap) n.x = -wrap;
      if (n.y < -wrap) n.y = this.h + wrap;
      else if (n.y > this.h + wrap) n.y = -wrap;
    }

    const k = 1 - Math.exp(-PARALLAX_EASE * dt);
    this.px += (this.targetX - this.px) * k;
    this.py += (this.targetY - this.py) * k;

    this.sincePulse += dt;
    if (this.sincePulse >= PULSE_EVERY_MS && this.nodes.length > 0) {
      this.sincePulse = 0;
      const n = this.nodes[Math.floor(this.random() * this.nodes.length)];
      if (n) this.pulses.push({ x: n.x, y: n.y, t: 0 });
    }
    if (this.pulses.length > 0) {
      for (const p of this.pulses) p.t = Math.min(1, p.t + dt / PULSE_MS);
      this.pulses = this.pulses.filter((p) => p.t < 1);
    }
  }

  /// Paint the current state. Allocates nothing.
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

  private sweepLinks(): void {
    this.linkCount = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i]!;
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j]!;
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
        ctx.moveTo(this.linkXY[o]!, this.linkXY[o + 1]!);
        ctx.lineTo(this.linkXY[o + 2]!, this.linkXY[o + 3]!);
      }
      if (opened) {
        ctx.strokeStyle = this.palette.link[tier]!;
        ctx.stroke();
      }
    }
  }

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
      const alpha = (1 - p.t) ** 2;
      if (alpha <= 0) continue;
      const grow = 1 - (1 - p.t) ** 3;
      ctx.strokeStyle = this.palette.pulse[tierOf(alpha)]!;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + grow * PULSE_R, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function tierOf(alpha: number): number {
  return Math.min(TIERS - 1, Math.floor(alpha * TIERS));
}
