import { Component, type ErrorInfo, type ReactNode } from "react";
import { userMessage } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { ErrorCard } from "./ErrorCard";

const log = createLogger("error-boundary");

interface Props {
  children: ReactNode;
  fallback?: (args: { error: unknown; reset(): void }) => ReactNode;
  /// Clears a latched error whenever this value changes.
  ///
  /// Keying the boundary itself would discard and rebuild the whole subtree on
  /// every change, remounting the entire page on each navigation for a route
  /// boundary. Resetting through state keeps the children mounted and drops only
  /// the error.
  resetKey?: unknown;
}

interface State {
  error?: unknown;
  /// Last `resetKey` this instance observed, so a change can be detected.
  resetKey?: unknown;
}

/// Async errors — `useEffect` callbacks, mutations — are not caught here; they
/// surface as toasts in the mutation layer.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { resetKey: this.props.resetKey };

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

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    log.error("caught", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: undefined });
  };

  override render(): ReactNode {
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
    <ErrorCard title="Something broke">
      <div className="err">{userMessage(error)}</div>
      <button type="button" className="btn" onClick={reset}>
        try again
      </button>
    </ErrorCard>
  );
}
