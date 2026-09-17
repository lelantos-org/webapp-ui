/// For fixed-duration UI transitions — not polling or retries.
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/// Modal enter and exit duration. Must match the `modal-*-fade` animations in `Modal.css`.
export const MODAL_EXIT_MS = 240;

/// Disclosure collapse duration. Must match the `.collapse` transition in `collapse.css`.
export const PANEL_COLLAPSE_MS = 220;

/// Whether the user asked for reduced motion; `false` when `matchMedia` is unavailable.
export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/// Wait out a CSS animation, or resolve at once under reduced motion.
export function animationDelay(ms: number): Promise<void> {
  return prefersReducedMotion() ? Promise.resolve() : sleep(ms);
}
