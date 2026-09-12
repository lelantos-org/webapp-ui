// Which backend services a session's health depends on, how to rank what a
// probe found, and the words on the header's health pill.
//
// One table rather than a list repeated per module: the `SystemHealth` type, the
// probe fan-out, and the indicator's rows and accessible name all derive from
// `MONITORED`, so a service cannot be probed but never shown, or shown but never
// probed.
//
// No I/O and no React here, so `HealthIndicator` can take the names and the
// ordering without pulling the query hook in behind them.

import { env } from "@/config/env";

/// The services probed, in the order they are reported.
///
/// A tuple rather than the keys of the table below, so the order is a value the
/// compiler knows rather than whatever `Object.keys` yields at runtime — which
/// also removes the cast that reading it back out would need.
///
/// `metaquoter` is deliberately absent: it is optional (`env.metaquoterUrl` may
/// be undefined, which switches swaps off) so its absence is a deployment
/// choice rather than an outage, and painting it red would report a configured
/// state as a fault.
export const SERVICE_NAMES = ["registry", "relayer", "fmd"] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

/// Base URL per service. Typed as a total record over `ServiceName`, so a name
/// added to the tuple above without a URL here is a compile error rather than a
/// service that reports `undefined` and probes the string "undefined/health".
export const MONITORED: Record<ServiceName, string> = {
  registry: env.registryUrl,
  relayer: env.relayerUrl,
  fmd: env.fmdUrl,
};

/// `unknown` is the state before the first probe resolves, not something a probe
/// returns — a service is reachable or it is not, and "we have not asked yet"
/// must not paint as either.
export type ServiceState = "up" | "down" | "unknown";

export type SystemHealth = Record<ServiceName, ServiceState>;

/// Ranked worst-first, so `worstOf` is a fold rather than a ternary chain.
const SEVERITY: Record<ServiceState, number> = { up: 0, unknown: 1, down: 2 };

/// The state to show for the system as a whole.
///
/// Worst wins: one service down is never hidden behind two that are up, and a
/// service not yet probed degrades the aggregate to `unknown` rather than
/// claiming health nobody has confirmed.
export function worstOf(states: readonly ServiceState[]): ServiceState {
  return states.reduce<ServiceState>(
    (worst, state) => (SEVERITY[state] > SEVERITY[worst] ? state : worst),
    "up",
  );
}

/// The words on the header's health pill.
///
/// The dot has a sentence beside it ("All systems normal"): a dot alone asks the
/// reader to know the colour code and to hover for the breakdown; the sentence
/// states the aggregate and, when something is wrong, which thing. Pure, so every state is testable without rendering the pill.
///
/// How each probed service is named to someone who does not run it.
const DISPLAY: Record<ServiceName, string> = {
  registry: "Registry",
  relayer: "Relayer",
  fmd: "Note feed",
};

export function serviceDisplayName(name: ServiceName): string {
  return DISPLAY[name];
}

/// The pill's sentence for a set of probe results.
///
/// Mirrors `worstOf`: one service down is named rather than hidden behind the
/// others, several down are counted, and a probe that has not answered yet says
/// so rather than claiming health nobody has confirmed.
export function healthLabel(
  services: readonly { name: ServiceName; state: ServiceState }[],
): string {
  const overall = worstOf(services.map((s) => s.state));
  if (overall === "up") return "All systems normal";
  if (overall === "unknown") return "Checking services…";
  const down = services.filter((s) => s.state === "down");
  const [only] = down;
  return down.length === 1 && only
    ? `${DISPLAY[only.name]} unreachable`
    : `${down.length} services unreachable`;
}
