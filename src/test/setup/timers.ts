// Setup for every vitest project.

import { afterEach, vi } from "vitest";

// A test that leaves fake timers on stalls the ones after it in the file.
afterEach(() => {
  vi.useRealTimers();
});
