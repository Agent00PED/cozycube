import { Component, type ReactNode } from "react";

/**
 * Keeps a missing or broken model file from taking the scene down. <Suspense> only covers a file
 * that is still LOADING; a file that 404s or fails to parse THROWS, and without this boundary that
 * would unmount the whole Canvas. On a failure it renders `fallback` (a plain proxy figure) and
 * says so once in the console.
 */
export class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode; what: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`[models] ${this.props.what} could not be loaded; showing a placeholder instead.`, error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
