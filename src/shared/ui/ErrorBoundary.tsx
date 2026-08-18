import { Component, type ErrorInfo, type ReactNode } from "react";
import { describeError } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("error-boundary");

interface Props {
  children: ReactNode;
  fallback?: (args: { error: unknown; reset(): void }) => ReactNode;
  /// Clears a latched error whenever this value changes.
  ///
  /// The alternative — keying the boundary itself — throws away and rebuilds
  /// the whole subtree on every change, which for a route boundary means the
  /// entire page remounts on every navigation. Resetting through state keeps
  /// the children mounted and only drops the error.
  resetKey?: unknown;
}

interface State {
  error?: unknown;
  /// Last `resetKey` this instance observed, so a change can be detected.
  resetKey?: unknown;
}

/// Async errors (e.g. `useEffect` callbacks, mutations) are NOT caught here —
/// those surface via toasts in the mutation layer.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  /// Runs before every render, including the one that follows a `resetKey`
  /// change, so the new children render immediately rather than after a
  /// throwaway pass showing the stale fallback.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.resetKey === props.resetKey) return null;
    return { error: undefined, resetKey: props.resetKey };
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
