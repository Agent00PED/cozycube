import React from "react";
import ReactDOM from "react-dom/client";
// Fredoka, the HUD's rounded face: bundled with the app (Discord's Activity CSP blocks font CDNs)
import "@fontsource-variable/fredoka";
// the Velvet Casino's faces: Cinzel for its titles, placards and chips, Outfit to read, Playfair
// Display for its people's words
import "@fontsource-variable/cinzel";
import "@fontsource-variable/outfit";
import "@fontsource-variable/playfair-display";
// Thai (names, chat): Noto Sans Thai, bundled too; every font stack falls back to it for Thai
import "@fontsource/noto-sans-thai/400.css";
import "@fontsource/noto-sans-thai/700.css";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { installPreloadErrorReload } from "./systems/lifecycle";
import { installInputMode } from "./systems/inputMode";

// a chunk from an older build that a new deploy no longer serves: reload onto the new one
installPreloadErrorReload();
// touch or keyboard: hides the keyboard hints and widens the tap targets on touch
installInputMode();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
