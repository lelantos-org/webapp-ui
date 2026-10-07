// Setup for the `dom` vitest project only.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Held here: a test may stub the globals, and a stub is still in place when `afterEach` runs.
const storages = [localStorage, sessionStorage];

// Unmount first: a mounted component may write to storage as it goes.
afterEach(() => {
  cleanup();
  for (const storage of storages) storage.clear();
});
