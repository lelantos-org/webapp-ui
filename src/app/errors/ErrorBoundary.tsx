import { Component, type ErrorInfo, type ReactNode } from "react";
import { userMessage } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { ErrorCard } from "./ErrorCard";

const log = createLogger("error-boundary");

interface Props {
  children: ReactNode;
  fallback?: (args: { error: unknown; reset(): void }) => ReactNode;
  /// Clears a latched error when this changes, without remounting the children.
  resetKey?: unknown;
}

interface State {
  error?: unknown;
  resetKey?: unknown;
}

/// Catches render errors; async errors surface as toasts instead.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

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
