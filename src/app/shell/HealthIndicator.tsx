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

/// The header's health pill: an aggregate dot, the sentence it stands for, and
/// the per-service breakdown on hover or focus.
///
/// The pill is a button so the breakdown is reachable without a pointer:
/// `.health:focus-within` needs a focusable descendant, or the breakdown is
/// mouse-only. A button also gives the label a role that agrees with it, where
/// `role="img"` beside an `aria-label` describing state would be two answers to
/// the same question.
///
/// The visible sentence ("All systems normal") is a summary; the
/// accessible name keeps the full per-service list, which is more than the
/// sentence says and exactly what the tooltip shows.
///
/// The services are read from `SERVICE_NAMES` rather than named here, so the
/// breakdown and the accessible name cannot fall out of step with what is
/// actually probed.
export function HealthIndicator() {
  const { data } = useSystemHealth();
  const tooltipId = useId();

  // `data` is absent until the first probe resolves, which is `unknown` for
  // every service rather than a missing row.
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

/// Every branch returns a defined custom property. An undefined one resolves to
/// nothing at paint time rather than erroring, which is how an invisible dot
/// shipped once — see the regression test.
function dotColor(state: ServiceState): string {
  return state === "up" ? "var(--accent)" : state === "down" ? "var(--err)" : "var(--fg-mute)";
}
