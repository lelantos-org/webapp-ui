import { useId } from "react";
import {
  healthLabel,
  SERVICE_NAMES,
  type ServiceState,
  serviceDisplayName,
  worstOf,
} from "./health";
import { useSystemHealth } from "./use-system-health";
import "./HealthIndicator.css";

/// Header health pill: aggregate dot and summary, with a per-service breakdown on hover or focus.
export function HealthIndicator() {
  const { data } = useSystemHealth();
  const tooltipId = useId();

  const services = SERVICE_NAMES.map((name) => ({
    name,
    state: data?.[name] ?? "unknown",
  }));
  const overall = worstOf(services.map((s) => s.state));
  const color = dotColor(overall);

  return (
    <span className="health" aria-live="polite">
      <button
        type="button"
        className="pill health__hit"
        aria-label={services.map((s) => `${s.name}: ${s.state}`).join(", ")}
        aria-describedby={tooltipId}
      >
        <span
          className="health__dot"
          style={{
            background: color,
            boxShadow: overall === "up" ? `0 0 8px ${color}` : "none",
          }}
        />
        <span className="health__txt" aria-hidden>
          {healthLabel(services)}
        </span>
      </button>
      <span className="health__tooltip" id={tooltipId} role="tooltip">
        {services.map((s) => (
          <Row key={s.name} label={serviceDisplayName(s.name)} state={s.state} />
        ))}
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
  return state === "up" ? "var(--accent)" : state === "down" ? "var(--err)" : "var(--fg-mute)";
}
