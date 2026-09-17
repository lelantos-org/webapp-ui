import { env } from "@/config/env";

/// The services probed, in report order. `metaquoter` is optional, so never shown as down.
export const SERVICE_NAMES = ["registry", "relayer", "fmd"] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

/// Base URL per service, read from `env` when probed.
export const MONITORED: Record<ServiceName, string> = {
  get registry() {
    return env.registryUrl;
  },
  get relayer() {
    return env.relayerUrl;
  },
  get fmd() {
    return env.fmdUrl;
  },
};

/// `unknown` means not yet probed, never a probe result.
export type ServiceState = "up" | "down" | "unknown";

export type SystemHealth = Record<ServiceName, ServiceState>;

const SEVERITY: Record<ServiceState, number> = { up: 0, unknown: 1, down: 2 };

/// Aggregate state: worst wins, and an unprobed service yields `unknown`.
export function worstOf(states: readonly ServiceState[]): ServiceState {
  return states.reduce<ServiceState>(
    (worst, state) => (SEVERITY[state] > SEVERITY[worst] ? state : worst),
    "up",
  );
}

const DISPLAY: Record<ServiceName, string> = {
  registry: "Registry",
  relayer: "Relayer",
  fmd: "Note feed",
};

/// User-facing name of a service.
export function serviceDisplayName(name: ServiceName): string {
  return DISPLAY[name];
}

/// The health pill's summary sentence for a set of probe results.
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
