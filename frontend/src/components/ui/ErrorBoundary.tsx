// ============================================================
// File: src/components/ui/ErrorBoundary.tsx
//
// React error boundary — catches render-tree errors in its children
// and shows a fallback UI instead of unmounting the whole app.
//
// What it catches:
//   - Errors thrown during render
//   - Errors in lifecycle methods
//   - Errors in constructors of child components
//
// What it DOES NOT catch:
//   - Errors in event handlers (those are caught by window.onerror)
//   - Errors in async code (setTimeout, fetch promise rejections)
//   - Errors in SSR (we don't use SSR)
//   - Errors thrown in the boundary itself
//
// Usage:
//   <ErrorBoundary name="Panel">
//     <Outlet />
//   </ErrorBoundary>
//
// When a child throws, the boundary captures the error and renders
// a friendly fallback. The user can click "Spróbuj ponownie" to
// reset the boundary (which re-mounts the children — useful for
// transient errors like a failed fetch).
//
// Logging:
//   - All errors are logged via console.error with the boundary `name`
//   - Component stack traces included for debugging
//   - No external reporting (Sentry etc.) — add later if needed
//
// IMPORTANT: Error boundaries MUST be class components. There's no
// hook equivalent in React stdlib as of 18/19.
// ============================================================

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children:  ReactNode;
  /** Human-readable name for logs and the fallback header (e.g. "Panel", "Header"). */
  name?:     string;
  /** Override the default fallback rendering. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error:          Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Called during render phase — must be pure. Just stash the error.
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Called during commit phase — side effects allowed (logging, telemetry).
    // We store componentStack here separately because getDerivedStateFromError
    // only has access to the error, not the React-specific info.
    this.setState({ componentStack: info.componentStack ?? null });
    const tag = this.props.name ? `[ErrorBoundary:${this.props.name}]` : "[ErrorBoundary]";
    console.error(tag, error, info.componentStack);
  }

  reset = (): void => {
    // Clearing state forces a re-render — children get re-mounted fresh.
    // If the underlying problem persists (bad data, broken hook), the boundary
    // will trigger again immediately.
    this.setState({ error: null, componentStack: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <ErrorFallback
          error={this.state.error}
          componentStack={this.state.componentStack}
          name={this.props.name}
          onReset={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

// ── Default fallback UI ──────────────────────────────────────

interface ErrorFallbackProps {
  error:          Error;
  componentStack: string | null;
  name?:          string;
  onReset:        () => void;
}

function ErrorFallback({ error, componentStack, name, onReset }: ErrorFallbackProps) {
  return (
    <div style={{
      padding:      "32px 24px",
      maxWidth:     560,
      margin:       "20px auto",
      background:   "#0d1424",
      border:       "1px solid #ef444444",
      borderRadius: 14,
      color:        "#e2e8f0",
      fontFamily:   "'DM Sans', sans-serif",
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>💥</div>
      <div style={{
        fontSize: 18, fontWeight: 800, marginBottom: 8, color: "#ef4444",
      }}>
        Coś poszło nie tak{name ? ` (${name})` : ""}
      </div>
      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20, lineHeight: 1.6 }}>
        Wystąpił nieoczekiwany błąd. Możesz spróbować ponownie — jeśli problem
        wraca, odśwież stronę (F5) lub zgłoś go nam.
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          onClick={onReset}
          style={{
            padding:      "9px 18px",
            background:   "#10b981",
            border:       "none",
            color:        "#fff",
            borderRadius: 8,
            cursor:       "pointer",
            fontSize:     13,
            fontWeight:   700,
          }}
        >
          🔄 Spróbuj ponownie
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding:      "9px 18px",
            background:   "transparent",
            border:       "1px solid #334155",
            color:        "#94a3b8",
            borderRadius: 8,
            cursor:       "pointer",
            fontSize:     13,
            fontWeight:   700,
          }}
        >
          ↻ Odśwież stronę
        </button>
      </div>

      <details style={{
        background:   "#0a0f1e",
        border:       "1px solid #1e293b",
        borderRadius: 8,
        padding:      "8px 12px",
        fontSize:     12,
      }}>
        <summary style={{
          cursor:     "pointer",
          color:      "#64748b",
          fontWeight: 600,
          padding:    "4px 0",
        }}>
          🔍 Pokaż szczegóły techniczne
        </summary>
        <div style={{
          marginTop:    10,
          paddingTop:   10,
          borderTop:    "1px solid #1e293b",
          color:        "#94a3b8",
          fontFamily:   "ui-monospace, SFMono-Regular, Consolas, monospace",
          fontSize:     11,
          lineHeight:   1.5,
          whiteSpace:   "pre-wrap",
          wordBreak:    "break-word",
          maxHeight:    300,
          overflowY:    "auto",
        }}>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ color: "#ef4444" }}>{error.name}:</strong>{" "}
            {error.message}
          </div>
          {error.stack && (
            <div style={{ color: "#475569", fontSize: 10 }}>
              {error.stack}
            </div>
          )}
          {componentStack && (
            <>
              <div style={{ marginTop: 10, marginBottom: 4, color: "#64748b" }}>
                Component stack:
              </div>
              <div style={{ color: "#475569", fontSize: 10 }}>
                {componentStack}
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
