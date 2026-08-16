import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/shared/lib/motion";
import { accentRgb } from "@/shared/lib/theme";

/**
 * Ambient canvas backdrop: a slowly drifting field of nodes wired to their
 * nearest neighbours, with periodic "shield" pulses. Reads as the commitment
 * set the wallet writes into — decorative only, never interactive.
 *
 * Cost control: node count scales with viewport area but is hard-capped, so the
 * neighbour pass is a bounded O(n^2). The draw path allocates nothing per frame
 * — link alphas are quantised into a fixed set of pre-built stroke styles and
 * each tier is stroked as a single batched path — which is what keeps motion
 * even instead of stuttering under GC. The loop stops entirely when the tab is
 * hidden or the user prefers reduced motion.
 */

type Node = {
  x: number;
  y: number;
  /** Heading in radians; speed is constant, only the heading curls. */
  a: number;
  /** Per-node phase so the curl never syncs across the field. */
  phase: number;
  r: number;
};

type Pulse = {
  x: number;
  y: number;
  /** 0 -> 1 progress; the pulse is retired at 1. */
  t: number;
};

const NODE_AREA = 26_000; // px^2 of viewport per node
const MAX_NODES = 90;
const MIN_NODES = 24;
const LINK_DIST = 150;
const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
const SPEED = 0.05; // px per ms
const CURL = 0.00022; // radians per ms of heading drift
const MAX_DT = 48; // clamp so a stalled frame never teleports the field
const PULSE_EVERY_MS = 2600;
const PULSE_MS = 1600;
const PULSE_R = 46;
const LINK_ALPHA = 0.14;
const NODE_ALPHA = 0.3;
/** Link alphas are quantised to this many steps; fewer draw calls, no banding. */
const TIERS = 10;
const PARALLAX = 14; // px of pointer-follow at the field's edge
const PARALLAX_EASE = 0.0035; // per ms approach rate toward the pointer target

function makeNode(w: number, h: number): Node {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    a: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2,
    r: 0.9 + Math.random() * 1.3,
  };
}

function nodeCount(w: number, h: number): number {
  return Math.max(MIN_NODES, Math.min(MAX_NODES, Math.round((w * h) / NODE_AREA)));
}

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const fine = window.matchMedia("(pointer: fine)").matches;
    const [ar, ag, ab] = accentRgb();

    // Pre-built styles: nothing in the draw path allocates a string.
    const linkStyles: string[] = Array.from(
      { length: TIERS },
      (_, i) => `rgba(${ar}, ${ag}, ${ab}, ${(((i + 1) / TIERS) * LINK_ALPHA).toFixed(4)})`,
    );
    const nodeStyle = `rgba(${ar}, ${ag}, ${ab}, ${NODE_ALPHA})`;
    const pulseStyles: string[] = Array.from(
      { length: TIERS },
      (_, i) => `rgba(${ar}, ${ag}, ${ab}, ${(((i + 1) / TIERS) * 0.28).toFixed(4)})`,
    );

    // Scratch buffers for one frame of links, sized for the node cap and
    // allocated once: the distance pass fills them, the draw pass replays them
    // per tier. Keeps the neighbour test at a single O(n^2) sweep per frame.
    const MAX_PAIRS = (MAX_NODES * (MAX_NODES - 1)) / 2;
    const linkXY = new Float32Array(MAX_PAIRS * 4);
    const linkTier = new Uint8Array(MAX_PAIRS);
    let linkCount = 0;

    let w = 0;
    let h = 0;
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    let raf = 0;
    let last = 0;
    let sincePulse = 0;
    // Pointer parallax, eased toward the target every frame rather than snapped.
    let px = 0;
    let py = 0;
    let targetX = 0;
    let targetY = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const prevW = w;
      const prevH = h;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (nodes.length === 0) {
        nodes = Array.from({ length: nodeCount(w, h) }, () => makeNode(w, h));
        return;
      }
      // Keep the existing field across a resize — rescale it and top up or trim
      // the count — so dragging a window edge doesn't reshuffle the whole page.
      if (prevW > 0 && prevH > 0) {
        const sx = w / prevW;
        const sy = h / prevH;
        for (const n of nodes) {
          n.x *= sx;
          n.y *= sy;
        }
      }
      const want = nodeCount(w, h);
      while (nodes.length < want) nodes.push(makeNode(w, h));
      if (nodes.length > want) nodes.length = want;
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(px, py);

      // One distance sweep into the scratch buffers...
      linkCount = 0;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DIST_SQ) continue;
          const fade = 1 - Math.sqrt(d2) / LINK_DIST;
          const o = linkCount * 4;
          linkXY[o] = a.x;
          linkXY[o + 1] = a.y;
          linkXY[o + 2] = b.x;
          linkXY[o + 3] = b.y;
          linkTier[linkCount] = Math.min(TIERS - 1, Math.floor(fade * TIERS));
          linkCount++;
        }
      }

      // ...then one batched stroke per alpha tier, instead of one per pair.
      ctx.lineWidth = 1;
      for (let tier = 0; tier < TIERS; tier++) {
        let opened = false;
        for (let k = 0; k < linkCount; k++) {
          if (linkTier[k] !== tier) continue;
          if (!opened) {
            ctx.beginPath();
            opened = true;
          }
          const o = k * 4;
          ctx.moveTo(linkXY[o], linkXY[o + 1]);
          ctx.lineTo(linkXY[o + 2], linkXY[o + 3]);
        }
        if (opened) {
          ctx.strokeStyle = linkStyles[tier];
          ctx.stroke();
        }
      }

      ctx.fillStyle = nodeStyle;
      ctx.beginPath();
      for (const n of nodes) {
        ctx.moveTo(n.x + n.r, n.y);
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      }
      ctx.fill();

      ctx.lineWidth = 1.2;
      for (const p of pulses) {
        // Ease-out on the radius, matching ease-in on the alpha, so the ring
        // dissolves rather than blinking out at full size.
        const grow = 1 - (1 - p.t) ** 3;
        const alpha = (1 - p.t) ** 2;
        const tier = Math.min(TIERS - 1, Math.floor(alpha * TIERS));
        if (alpha <= 0) continue;
        ctx.strokeStyle = pulseStyles[tier];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + grow * PULSE_R, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(MAX_DT, now - last);
      last = now;
      if (dt <= 0) return;

      const wrap = LINK_DIST;
      for (const n of nodes) {
        // Curl the heading instead of bouncing off edges: motion stays smooth
        // and no node ever reverses on the spot.
        n.phase += dt * 0.0004;
        n.a += Math.sin(n.phase) * CURL * dt;
        n.x += Math.cos(n.a) * SPEED * dt;
        n.y += Math.sin(n.a) * SPEED * dt;
        if (n.x < -wrap) n.x = w + wrap;
        else if (n.x > w + wrap) n.x = -wrap;
        if (n.y < -wrap) n.y = h + wrap;
        else if (n.y > h + wrap) n.y = -wrap;
      }

      // Frame-rate independent exponential approach — same feel at 60 and 120Hz.
      const k = 1 - Math.exp(-PARALLAX_EASE * dt);
      px += (targetX - px) * k;
      py += (targetY - py) * k;

      sincePulse += dt;
      if (sincePulse >= PULSE_EVERY_MS && nodes.length > 0) {
        sincePulse = 0;
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        pulses.push({ x: n.x, y: n.y, t: 0 });
      }
      if (pulses.length > 0) {
        for (const p of pulses) p.t = Math.min(1, p.t + dt / PULSE_MS);
        pulses = pulses.filter((p) => p.t < 1);
      }

      draw();
    };

    const start = () => {
      if (raf || reduced) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onPointer = (e: PointerEvent) => {
      targetX = (e.clientX / w - 0.5) * -2 * PARALLAX;
      targetY = (e.clientY / h - 0.5) * -2 * PARALLAX;
    };

    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        resize();
        if (!raf) draw();
      });
    };

    resize();
    draw();
    start();

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    if (fine && !reduced) window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      stop();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={ref} className="backdrop" aria-hidden="true" tabIndex={-1} />;
}
