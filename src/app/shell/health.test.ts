// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { healthLabel, MONITORED, SERVICE_NAMES, type ServiceState, worstOf } from "./health";

describe("worstOf", () => {
  it("reports up only when every service is up", () => {
    expect(worstOf(["up", "up", "up"])).toBe("up");
  });

  /// One service down must never hide behind two that are up, whichever
  /// position it holds — the fold has to consider all of them, not stop at the
  /// first.
  it.each([0, 1, 2])("reports down when the service at index %i is down", (i) => {
    const states: ServiceState[] = ["up", "up", "up"];
    states[i] = "down";
    expect(worstOf(states)).toBe("down");
  });

  /// A service nobody has probed yet must not be counted as healthy: the
  /// aggregate says "we do not know" rather than claiming health.
  it("reports unknown when a service has not been probed and none is down", () => {
    expect(worstOf(["up", "unknown", "up"])).toBe("unknown");
  });

  /// down outranks unknown: an outage we have confirmed is worse news than one
  /// we have not asked about, and is what the user needs told.
  it("prefers down over unknown", () => {
    expect(worstOf(["unknown", "down"])).toBe("down");
    expect(worstOf(["down", "unknown"])).toBe("down");
  });

  /// Total, so a caller never has to guard the empty case. Vacuously healthy is
  /// the right identity: it is what the fold reduces to, and it only arises if
  /// `MONITORED` is emptied, which the test below rules out.
  it("is total over an empty list", () => {
    expect(worstOf([])).toBe("up");
  });
});

describe("MONITORED", () => {
  /// The table drives the probe fan-out, the `SystemHealth` type and the
  /// indicator's rows; an empty one would paint a permanently healthy dot with
  /// nothing behind it. The order is the reported order, and the accessible
  /// name is asserted against it in `HealthIndicator.test.tsx`: a contract, not
  /// whatever `Object.keys` happened to yield.
  it("reports in a fixed order", () => {
    expect(SERVICE_NAMES).toEqual(["registry", "relayer", "fmd"]);
  });

  /// Every entry must be a usable base: the probe appends `/health` by
  /// template, so a blank or slash-terminated value would produce a URL that
  /// does not resolve to a health endpoint.
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

  // Not yet probed is not healthy: the pill must not claim what nobody checked.
  it("says it is still checking before every probe has answered", () => {
    expect(healthLabel(all("up", "unknown", "up"))).toBe("Checking services…");
  });

  it("names the one service that is down", () => {
    expect(healthLabel(all("up", "up", "down"))).toBe("Note feed unreachable");
  });

  // Worst wins over unknown, as in `worstOf`.
  it("reports a down service even while another is unknown", () => {
    expect(healthLabel(all("unknown", "down", "up"))).toBe("Relayer unreachable");
  });

  it("counts several services down rather than naming a list", () => {
    expect(healthLabel(all("down", "down", "up"))).toBe("2 services unreachable");
  });
});
