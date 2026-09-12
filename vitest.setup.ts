import { afterEach } from "vitest";

// Only suites running under jsdom render, so only they pay for Testing Library
// and its matchers; a node suite would load them for nothing.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");

  // React 18 only honours `act()` when this is set, and warns on every state
  // update outside one when it is not. Without it the warnings are unavoidable
  // noise rather than a signal, so a real un-acted update hides among them.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    cleanup();
  });
}
