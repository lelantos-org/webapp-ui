import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React 18 only honours `act()` when this is set, and warns on every state
// update outside one when it is not. Without it the warnings are unavoidable
// noise rather than a signal, so a real un-acted update hides among them.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
