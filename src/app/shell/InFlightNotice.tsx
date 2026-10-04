import { Link, useLocation } from "react-router-dom";
import { useOpsInFlight } from "@/features/tx";
import { useOpScope } from "./use-op-scope";
import "./InFlightNotice.css";

/// A way back to a transaction still in flight on a screen the user has left. On its own screen
/// the progress card says the same thing, so nothing is shown there.
export function InFlightNotice() {
  const { pathname } = useLocation();
  const elsewhere = useOpsInFlight(useOpScope()).filter((op) => op.path !== pathname);

  const [first] = elsewhere;
  if (!first) return null;
  return (
    <Link className="inflight" to={first.path} role="status">
      <span className="spinner" aria-hidden="true" />
      <span>
        {elsewhere.length === 1
          ? `Your ${first.label} is still in progress`
          : `${elsewhere.length} transactions are still in progress`}
      </span>
      <span className="inflight__go">View</span>
    </Link>
  );
}
