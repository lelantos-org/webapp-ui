import { describe, expect, it } from "vitest";
import { relativeTime } from "./time";

describe("relativeTime", () => {
  const now = 1_700_000_000_000;
  it("picks a unit by magnitude", () => {
    expect(relativeTime(now - 30_000, now)).toMatch(/30 sec/);
    expect(relativeTime(now - 5 * 60_000, now)).toMatch(/5 min/);
    expect(relativeTime(now - 3 * 3_600_000, now)).toMatch(/3 hr/);
    expect(relativeTime(now - 2 * 86_400_000, now)).toMatch(/2 days/);
  });
});
