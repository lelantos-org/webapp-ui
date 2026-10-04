import { useEffect, useRef } from "react";
import { useTheme } from "@/shared/hooks/use-theme";
import { prefersReducedMotion } from "@/shared/lib/motion";
import { BackdropField } from "./backdrop-field";
import { accentRgb, buildPalette } from "./backdrop-palette";

// 1, not devicePixelRatio: faint hairlines hide the upscale and HiDPI quadruples raster cost.
const RENDER_SCALE = 1;

const FRAME_MS = 1000 / 30;

const IDLE_MS = 8000;

/// A phone's toolbar sliding away changes the height by about this much, many times a scroll.
const TOOLBAR_PX = 120;

/// Decorative canvas backdrop. It animates only for a mouse or trackpad, and parks when hidden
/// or idle; on touch devices and under reduced motion it is one still frame.
export function Backdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const recolour = useRef<(() => void) | undefined>(undefined);
  const { theme } = useTheme();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `theme` is the trigger; the accent is read off the CSS it switches
  useEffect(() => {
    recolour.current?.();
  }, [theme]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
    // Still on touch: there is no pointer to follow, and the frames would be spent while the
    // user scrolls and types.
    const still = prefersReducedMotion() || !hasFinePointer;
    const field = new BackdropField(buildPalette(accentRgb()));

    let raf = 0;
    let lastFrame = 0;
    let sinceInput = 0;

    let fitW = 0;
    let fitH = 0;
    /// Sizes the canvas to the viewport; `false` when it already covers it.
    const fitToViewport = (): boolean => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // A toolbar sliding back in shrinks the viewport: the canvas still covers it, and
      // reallocating on every such resize is what makes scrolling stutter.
      if (w === fitW && h <= fitH && fitH - h < TOOLBAR_PX) return false;
      fitW = w;
      fitH = h;
      canvas.width = Math.round(w * RENDER_SCALE);
      canvas.height = Math.round(h * RENDER_SCALE);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
      field.resize(w, h);
      return true;
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
      if (raf || still) return;
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
        if (fitToViewport() && !raf) field.draw(ctx);
      });
    };

    fitToViewport();
    field.draw(ctx);
    start();

    recolour.current = () => {
      field.setPalette(buildPalette(accentRgb()));
      if (!raf) field.draw(ctx);
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    // The pointer is the only thing that wakes it: scrolling, typing and taps are when the
    // page needs its frames for itself.
    if (!still) window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      recolour.current = undefined;
      stop();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return <canvas ref={ref} className="backdrop" aria-hidden="true" tabIndex={-1} />;
}
