import { Link, useLocation } from "react-router-dom";
import { dismissInterrupted, type InterruptedOp, useInterruptedOps } from "@/features/tx";
import { useOpScope } from "./use-op-scope";
import "./InFlightNotice.css";

/// What became of a transaction the page was reloaded under: it either never left this tab, or
/// was handed over and may have gone through.
function interruptedCopy(ops: readonly InterruptedOp[]): string {
  const [first] = ops;
  const what = ops.length === 1 && first ? `Your ${first.label} was` : "Transactions were";
  return ops.some((op) => op.maybeSent)
    ? `${what} interrupted by a page reload after being handed over. It may still go through: check your balance before sending again.`
    : `${what} interrupted by a page reload before anything was sent. Nothing moved; start again when you are ready.`;
}

/// Tells the user about transactions a page reload cut short, until they dismiss it.
export function InterruptedNotice() {
  const { pathname } = useLocation();
  const scope = useOpScope();
  const ops = useInterruptedOps(scope);

  const [first] = ops;
  if (!first) return null;
  return (
    <div className="inflight inflight--warn" role="status">
      <span>{interruptedCopy(ops)}</span>
      {ops.length === 1 && first.path !== pathname ? (
        <Link className="inflight__go" to={first.path}>
          Open
        </Link>
      ) : null}
      <button
        type="button"
        className="link-btn inflight__go"
        onClick={() => dismissInterrupted(scope)}
      >
        Dismiss
      </button>
    </div>
  );
}
