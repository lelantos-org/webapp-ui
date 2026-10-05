import { onTestFinished } from "vitest";
import { resetEnvForTest } from "@/config/env";
import { LOCAL_KEYS } from "@/shared/lib/storage/keys";

/// Load the settings with `overrides` stored as an earlier visit left them, until the test ends.
export function chooseEndpoints(overrides: Record<string, unknown>): void {
  localStorage.setItem(LOCAL_KEYS.endpoints, JSON.stringify(overrides));
  resetEnvForTest();
  onTestFinished(() => {
    localStorage.removeItem(LOCAL_KEYS.endpoints);
    resetEnvForTest();
  });
}
