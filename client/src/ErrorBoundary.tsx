import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, any render-time throw (a bad WebGL context, a null ref access, a Discord SDK
// handshake that rejects outside a try/catch) unmounts the whole tree and leaves a silent
// white screen — exactly the symptom that's hard to diagnose inside a Discord Activity iframe
// where the console isn't visible without opening DevTools first.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "#0e0e16",
            color: "#ff6b6b",
            fontFamily: "var(--font-cozy)",
            fontSize: 14,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>Something crashed</div>
          <div style={{ maxWidth: 480, whiteSpace: "pre-wrap", opacity: 0.85 }}>
            {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
