import { Component, type ErrorInfo, type ReactNode } from "react";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("error-boundary");

interface Props {
  children: ReactNode;
  fallback?: (args: { error: unknown; reset(): void }) => ReactNode;
}

interface State {
  error?: unknown;
}

/// Async errors (e.g. `useEffect` callbacks, mutations) are NOT caught here —
/// those surface via toasts in the mutation layer.
export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    log.error("caught", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: undefined });
  };

  render(): ReactNode {
    if (this.state.error !== undefined) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, reset }: { error: unknown; reset(): void }) {
  return (
    <div className="card m-5">
      <div className="card__hdr">
        <h3 className="card__t">something broke</h3>
      </div>
      <div className="stack stack--md">
        <div className="err">{describeError(error)}</div>
        <button type="button" className="btn" onClick={reset}>
          try again
        </button>
      </div>
    </div>
  );
}
