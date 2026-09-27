import React from "react";
import ReactDOM from "react-dom/client";
// Fredoka, the HUD's rounded face: bundled with the app (Discord's Activity CSP blocks font CDNs)
import "@fontsource-variable/fredoka";
// the Velvet Casino's faces: Cinzel for its titles, placards and chips, Outfit to read, Playfair
// Display for its people's words
import "@fontsource-variable/cinzel";
import "@fontsource-variable/outfit";
import "@fontsource-variable/playfair-display";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { installPreloadErrorReload } from "./systems/lifecycle";

// a chunk from an older build that a new deploy no longer serves: reload onto the new one
installPreloadErrorReload();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
