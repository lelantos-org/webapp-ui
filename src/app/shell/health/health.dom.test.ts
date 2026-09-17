import { describe, expect, it } from "vitest";
import { healthLabel, MONITORED, SERVICE_NAMES, type ServiceState, worstOf } from "./health";

describe("worstOf", () => {
  it("reports up only when every service is up", () => {
    expect(worstOf(["up", "up", "up"])).toBe("up");
  });

  it.each([0, 1, 2])("reports down when the service at index %i is down", (i) => {
    const states: ServiceState[] = ["up", "up", "up"];
    states[i] = "down";
    expect(worstOf(states)).toBe("down");
  });

  it("reports unknown when a service has not been probed and none is down", () => {
    expect(worstOf(["up", "unknown", "up"])).toBe("unknown");
  });

  it("prefers down over unknown", () => {
    expect(worstOf(["unknown", "down"])).toBe("down");
    expect(worstOf(["down", "unknown"])).toBe("down");
  });

  it("is total over an empty list", () => {
    expect(worstOf([])).toBe("up");
  });
});

describe("MONITORED", () => {
  it("reports in a fixed order", () => {
    expect(SERVICE_NAMES).toEqual(["registry", "relayer", "fmd"]);
  });

  it.each(Object.entries(MONITORED))("gives %s a base a probe can append to", (_name, base) => {
    expect(base.length).toBeGreaterThan(0);
    expect(base.endsWith("/")).toBe(false);
    expect(() => new URL(`${base}/health`)).not.toThrow();
  });
});

const all = (registry: ServiceState, relayer: ServiceState, fmd: ServiceState) => [
  { name: "registry" as const, state: registry },
  { name: "relayer" as const, state: relayer },
  { name: "fmd" as const, state: fmd },
];

describe("healthLabel", () => {
  it("reads as normal only when every service answered", () => {
    expect(healthLabel(all("up", "up", "up"))).toBe("All systems normal");
  });

  it("says it is still checking before every probe has answered", () => {
    expect(healthLabel(all("up", "unknown", "up"))).toBe("Checking services…");
  });

  it("names the one service that is down", () => {
    expect(healthLabel(all("up", "up", "down"))).toBe("Note feed unreachable");
  });

  it("reports a down service even while another is unknown", () => {
    expect(healthLabel(all("unknown", "down", "up"))).toBe("Relayer unreachable");
  });

  it("counts several services down rather than naming a list", () => {
    expect(healthLabel(all("down", "down", "up"))).toBe("2 services unreachable");
  });
});
