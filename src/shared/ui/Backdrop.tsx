import { useEffect, useRef } from "react";
import { onActivity } from "@/shared/lib/activity";
import { prefersReducedMotion } from "@/shared/lib/motion";
import { accentRgb } from "@/shared/lib/theme";
import { BackdropField, buildPalette } from "@/shared/ui/backdrop-field";

/**
 * Ambient canvas backdrop, rendering the commitment set the wallet writes into.
 * Decorative and non-interactive.
 *
 * Schedules frames; `BackdropField` defines their contents.
 *
 * The loop stops when the tab is hidden, when the user prefers reduced motion,
 * and after `IDLE_MS` without input. Any input resumes it.
 */

/**
 * Backing-store scale, fixed at 1 rather than tracking `devicePixelRatio`. The
 * field is 14%-alpha hairlines under a radial mask, so the upscale is not
 * visible, while a HiDPI backing store quadruples the per-frame clear and
 * raster cost.
 */
const RENDER_SCALE = 1;

/**
 * Frame budget. 30fps is sufficient for drift at this speed and halves the
 * frame count on a 60Hz display, quartering it on 120Hz.
 */
const FRAME_MS = 1000 / 30;

/** Quiet period after which the loop parks, including on a visible tab. */
const IDLE_MS = 8000;

export function Backdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // `desynchronized`: this layer sits behind all content and does not need to
    // land in the same frame as the DOM painted above it.
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
    const field = new BackdropField(buildPalette(accentRgb()));

    let raf = 0;
    let lastFrame = 0;
    let sinceInput = 0;

    const fitToViewport = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * RENDER_SCALE);
      canvas.height = Math.round(h * RENDER_SCALE);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
      field.resize(w, h);
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      // Frame cap. `lastFrame` advances only on processed frames, so `dt`
      // covers the full elapsed time and drift speed is unaffected.
      if (now - lastFrame < FRAME_MS - 0.5) return;
      const dt = now - lastFrame;
      lastFrame = now;

      field.advance(dt);
      field.draw(ctx);

      // Park after the idle budget. The frame just drawn remains on screen.
      sinceInput += dt;
      if (sinceInput >= IDLE_MS) stop();
    };

    const start = () => {
      if (raf || reduced) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(step);
    };

    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const wake = () => {
      sinceInput = 0;
      start();
    };

    const onVisibility = () => (document.hidden ? stop() : wake());

    const onPointerMove = (e: PointerEvent) => {
      field.aimAt(e.clientX, e.clientY);
      wake();
    };

    // Coalesced to one frame: dragging a window edge fires `resize`
    // continuously, and re-fitting the canvas reallocates its backing store.
    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        fitToViewport();
        // Paint here only while parked; a running loop covers it otherwise.
        if (!raf) field.draw(ctx);
      });
    };

    fitToViewport();
    field.draw(ctx);
    start();

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    if (hasFinePointer && !reduced) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }
    // Not limited to fine pointers, unlike `pointermove` above: without a
    // pointer-move stream a touch device has no other way to resume the loop.
    const stopWatchingInput = onActivity(wake);

    return () => {
      stop();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      stopWatchingInput();
    };
  }, []);

  return <canvas ref={ref} className="backdrop" aria-hidden="true" tabIndex={-1} />;
}
