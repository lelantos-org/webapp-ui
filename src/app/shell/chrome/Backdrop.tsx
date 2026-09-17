import { useEffect, useRef } from "react";
import { onActivity } from "@/shared/lib/idle";
import { prefersReducedMotion } from "@/shared/lib/motion";
import { BackdropField } from "./backdrop-field";
import { accentRgb, buildPalette } from "./backdrop-palette";

// 1, not devicePixelRatio: faint hairlines hide the upscale and HiDPI quadruples raster cost.
const RENDER_SCALE = 1;

const FRAME_MS = 1000 / 30;

const IDLE_MS = 8000;

/// Decorative canvas backdrop; parks when hidden, idle, or under reduced motion.
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
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
      if (now - lastFrame < FRAME_MS - 0.5) return;
      const dt = now - lastFrame;
      lastFrame = now;

      field.advance(dt);
      field.draw(ctx);

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

    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        fitToViewport();
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
    // All pointers: touch devices have no pointermove stream to resume the loop.
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
