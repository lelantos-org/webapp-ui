// Motion preferences, and the timings JS shares with the stylesheet.
//
// The stylesheet opts out of its animations through
// `@media (prefers-reduced-motion: reduce)`. Anything driven by a timer must make
// the same check, or it keeps waiting out an animation that has been disabled.

/// For fixed-duration UI transitions — not polling or retries.
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/// Modal enter and exit duration. Must match the `modal-*-fade` animations in
/// `shared/ui/Modal.css`; every modal that waits out its own fade reads it from here, so one
/// value stays in step with the CSS.
export const MODAL_EXIT_MS = 240;

/// Disclosure collapse duration. Must match the `grid-template-rows` transition on
/// `.collapse` in `styles/primitives/collapse.css` (`--dur-220`); a collapsing
/// body stays mounted for exactly this long so there is something to collapse.
export const PANEL_COLLAPSE_MS = 220;

/// False when `matchMedia` is unavailable, as in SSR and older test environments.
export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/// Waits out a CSS animation, or returns at once when the user has asked for
/// reduced motion and there is no animation left to wait for.
export function animationDelay(ms: number): Promise<void> {
  return prefersReducedMotion() ? Promise.resolve() : sleep(ms);
}
