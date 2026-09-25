import React from "react";
import ReactDOM from "react-dom/client";
// Fredoka, the HUD's rounded face: bundled with the app (Discord's Activity CSP blocks font CDNs)
import "@fontsource-variable/fredoka";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
