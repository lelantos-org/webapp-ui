import { describe, expect, it } from "vitest";
import { buildPalette } from "./backdrop-palette";

describe("buildPalette", () => {
  it("builds one style per tier at increasing alpha", () => {
    const p = buildPalette([1, 2, 3]);
    expect(p.link).toHaveLength(10);
    expect(p.pulse).toHaveLength(10);
    expect(p.link[0]).toContain("rgba(1, 2, 3,");
    const alpha = (s: string) => Number(s.slice(s.lastIndexOf(",") + 1, -1));
    expect(alpha(p.link[0]!)).toBeLessThan(alpha(p.link[9]!));
  });
});
