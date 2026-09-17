import { afterEach, describe, expect, it } from "vitest";
import {
  appendSample,
  etaText,
  MAX_SAMPLES,
  median,
  readProveSamples,
  recordProveDuration,
} from "./prove-eta";

afterEach(() => localStorage.clear());

describe("median", () => {
  it("is undefined with nothing measured", () => {
    expect(median([])).toBeUndefined();
  });

  it("takes the middle sample, so one throttled proof does not skew it", () => {
    expect(median([20_000, 22_000, 180_000])).toBe(22_000);
    expect(median([10_000, 30_000])).toBe(20_000);
  });
});

describe("etaText", () => {
  it("says nothing on a device that has never proved", () => {
    expect(etaText([], 0)).toBeUndefined();
  });

  it("rounds the time left up to five seconds", () => {
    expect(etaText([30_000], 9_000)).toBe("about 25 seconds left");
    expect(etaText([30_000], 10_000)).toBe("about 20 seconds left");
  });

  it("stops counting down in the last seconds and past the usual time", () => {
    expect(etaText([30_000], 27_000)).toBe("a few seconds left");
    expect(etaText([30_000], 45_000)).toBe("taking longer than usual");
  });

  it("switches to minutes for slow machines", () => {
    expect(etaText([150_000], 0)).toBe("about 3 minutes left");
    expect(etaText([62_000], 0)).toBe("about a minute left");
  });
});

describe("samples", () => {
  it("keeps the newest few", () => {
    const many = Array.from({ length: MAX_SAMPLES }, (_, i) => 1_000 + i);
    expect(appendSample(many, 99_000)).toHaveLength(MAX_SAMPLES);
    expect(appendSample(many, 99_000).at(-1)).toBe(99_000);
    expect(appendSample(many, 99_000)[0]).toBe(1_001);
  });

  it("persists a completed proof and ignores noise", () => {
    recordProveDuration(24_000);
    recordProveDuration(50); // not a proof
    recordProveDuration(Number.NaN);
    expect(readProveSamples()).toEqual([24_000]);
  });

  it("reads a corrupt entry as no samples", () => {
    localStorage.setItem("lelantos:prove-durations", '{"not":"an array"}');
    expect(readProveSamples()).toEqual([]);
  });
});
