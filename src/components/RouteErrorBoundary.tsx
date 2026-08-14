import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Changes to this value reset the boundary (e.g. the current pathname). */
  resetKey?: string;
}
interface State {
  error: Error | null;
}

/**
 * Catches render errors so a broken screen shows a recovery card instead of a
 * blank white page. Members reported onboarding "skipping to a blank page" —
 * an uncaught render error unmounted the whole route tree.
 */
class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[strand] route crashed", error, info?.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-10 bg-background">
        <div className="w-full max-w-[300px] rounded-2xl border border-border bg-card p-5 text-center">
          <h1 className="font-display text-lg text-foreground">Something didn't load</h1>
          <p className="mt-2 text-[13px] leading-snug text-muted-foreground font-body">
            Your answers are saved. Reload this screen to carry on where you left off.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 w-full min-h-[44px] rounded-pill bg-primary text-primary-foreground text-sm font-body"
          >
            Reload
          </button>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 w-full min-h-[44px] rounded-pill border border-border text-sm font-body text-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default RouteErrorBoundary;
