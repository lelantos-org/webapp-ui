import type { Phase, ProposalState } from "@/features/governance";
import { cx } from "@/shared/lib/cx";
import { stateLabel, stateTone } from "../governance-copy";

/// The proposal's `state()`, plus "Against only" once For and Abstain have closed.
export function StateBadge({
  state,
  phase,
}: {
  state: ProposalState | undefined;
  phase?: Phase | undefined;
}) {
  return (
    <span className="gov-badges">
      <span className={cx("badge", "gov-badge", `gov-badge--${stateTone(state)}`)}>
        {stateLabel(state)}
      </span>
      {phase === "against" ? (
        <span className="badge gov-badge gov-badge--warn">Against only</span>
      ) : null}
    </span>
  );
}
