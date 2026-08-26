import { type ServiceState, useSystemHealth } from "./use-system-health";

/// Single aggregate dot for relayer + fmd reachability.
export function HealthIndicator() {
  const { data } = useSystemHealth();
  const relayer = data?.relayer ?? "unknown";
  const fmd = data?.fmd ?? "unknown";
  const overall: ServiceState =
    relayer === "down" || fmd === "down"
      ? "down"
      : relayer === "unknown" || fmd === "unknown"
        ? "unknown"
        : "up";
  const color = dotColor(overall);
  return (
    <span className="health" aria-live="polite">
      <span
        className="health__dot"
        role="img"
        aria-label={`relayer: ${relayer}, fmd: ${fmd}`}
        style={{
          background: color,
          boxShadow: overall === "up" ? `0 0 8px ${color}` : "none",
        }}
      />
      <span className="health__tooltip" role="tooltip">
        <Row label="relayer" state={relayer} />
        <Row label="fmd" state={fmd} />
      </span>
    </span>
  );
}

function Row({ label, state }: { label: string; state: ServiceState }) {
  return (
    <span className="health__row">
      <span className="health__dot health__dot--sm" style={{ background: dotColor(state) }} />
      <span className="health__label">{label}</span>
      <span className="health__state">{state}</span>
    </span>
  );
}

function dotColor(state: ServiceState): string {
  return state === "up" ? "var(--accent)" : state === "down" ? "var(--err)" : "var(--muted)";
}
