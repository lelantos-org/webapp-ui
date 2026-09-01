import { useId } from "react";
import { type ServiceState, useSystemHealth } from "./use-system-health";

/// Single aggregate dot for relayer + fmd reachability.
///
/// The dot is a button so the tooltip is reachable without a pointer. It was a
/// `role="img"` span, which left `.health:focus-within` in the stylesheet unable
/// to match anything — there was no focusable descendant — so the per-service
/// breakdown was mouse-only. A button also gives the label a role that agrees
/// with it; `role="img"` alongside an `aria-label` describing state was two
/// answers to the same question.
export function HealthIndicator() {
  const { data } = useSystemHealth();
  const tooltipId = useId();
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
      <button
        type="button"
        className="health__hit"
        aria-label={`relayer: ${relayer}, fmd: ${fmd}`}
        aria-describedby={tooltipId}
      >
        <span
          className="health__dot"
          style={{
            background: color,
            boxShadow: overall === "up" ? `0 0 8px ${color}` : "none",
          }}
        />
      </button>
      <span className="health__tooltip" id={tooltipId} role="tooltip">
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
  return state === "up" ? "var(--accent)" : state === "down" ? "var(--err)" : "var(--fg-mute)";
}
