import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Sentry } from '../../observability/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Top-level error boundary so a render crash anywhere downstream renders a
// friendly fallback instead of a blank screen. Reports to Sentry if a DSN is
// configured (initSentry is a no-op without one, so this is safe in dev).
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <main
          role="alert"
          className="min-h-screen flex flex-col items-center justify-center px-4 py-12
                     bg-slate-50 dark:bg-kitchen-ink text-slate-900 dark:text-slate-100"
        >
          <div className="max-w-md w-full space-y-4 text-center">
            <h1 className="text-2xl font-bold">Something went wrong.</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              ChefFlow hit an unexpected error and stopped rendering. Your data is safe — it
              lives in your browser and our server, not in this view.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="btn-primary text-sm"
            >
              Reload the app
            </button>
            <p className="text-xs text-slate-500">
              If this keeps happening, drop us a note from the Help menu on a working page.
            </p>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
