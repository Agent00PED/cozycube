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
import { ReconnectCurtain, UpdateRequiredScreen } from "./components/UpdateScreens";
import { installPreloadErrorHandler, useLifecycle } from "./systems/lifecycle";
import { installInputMode } from "./systems/inputMode";

// a chunk from an older build that a new deploy no longer serves: ask for a fresh start of the Activity
installPreloadErrorHandler();
// touch or keyboard: hides the keyboard hints and widens the tap targets on touch
installInputMode();

/**
 * The game by the page's lifecycle (systems/lifecycle.ts), never by reloading: a soft restart
 * unmounts it behind the "Updating" curtain (the scene, its GPU buffers and its sounds let go) and
 * mounts a fresh one (`generation`) that rejoins the same lounge with the Discord session kept in
 * memory; an outdated build unmounts it for good and asks for a fresh start of the Activity.
 */
function Root() {
  const { phase, generation } = useLifecycle();
  if (phase === "outdated") return <UpdateRequiredScreen />;
  return (
    <>
      {phase !== "restarting" && <App key={generation} />}
      {(phase === "restarting" || phase === "rejoining") && <ReconnectCurtain />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
);
