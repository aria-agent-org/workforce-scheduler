import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[300px] items-center justify-center p-8" dir="rtl" role="alert">
          <div className="text-center max-w-md mx-auto">
            <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shadow-elevation-2">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold mb-2">משהו השתבש</h2>
            <p className="text-sm text-muted-foreground mb-6">
              אירעה שגיאה בלתי צפויה. ניתן לנסות שוב או לרענן את הדף.
            </p>
            {this.state.error && (
              <details className="mb-4 text-start rounded-lg bg-muted/50 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground">פרטי שגיאה</summary>
                <pre className="mt-2 whitespace-pre-wrap text-red-600 dark:text-red-400 text-xs overflow-auto max-h-32" dir="ltr">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-6 py-3 text-sm font-medium text-white shadow-elevation-2 hover:shadow-elevation-3 transition-all min-h-[44px]"
                onClick={this.handleRetry}
              >
                <RefreshCw className="h-4 w-4" />
                נסה שוב
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-medium hover:bg-muted transition-all min-h-[44px]"
                onClick={() => window.location.reload()}
              >
                רענן דף
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
