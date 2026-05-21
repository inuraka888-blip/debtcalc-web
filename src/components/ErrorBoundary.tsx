"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "@/lib/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("React error boundary caught an error.", { error, errorInfo });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="min-h-screen px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 p-5">
          <h1 className="text-xl font-semibold text-zinc-950">
            {this.props.title ?? "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-zinc-700">
            {this.props.description ?? "This section could not be rendered. Your local data was not changed."}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Retry
          </button>
        </section>
      </main>
    );
  }
}
