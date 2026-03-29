import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center" dir="rtl">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-destructive">שגיאה</h1>
            <p className="mt-2 text-muted-foreground">
              משהו השתבש. נסה לרענן את הדף.
            </p>
            <button
              className="mt-4 rounded-md bg-primary-500 px-4 py-2 text-white"
              onClick={() => window.location.reload()}
            >
              רענן
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
