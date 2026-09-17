import { useCallback, useRef, type CSSProperties } from "react";
import { IsometricCanvas } from "./scene/IsometricCanvas";
import { WorldScene } from "./components/WorldScene";
import { ColorPickerUI } from "./components/ColorPickerUI";
import { MapSwitcherUI } from "./components/MapSwitcherUI";
import { EmoteBar } from "./components/hud/EmoteBar";
import { ActivityBar } from "./components/hud/ActivityBar";
import { VoiceChip } from "./components/hud/VoiceChip";
import { PlayerRoster } from "./components/hud/PlayerRoster";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
import { useColyseusRoom } from "./hooks/useColyseusRoom";
import { useVoiceActivity } from "./hooks/useVoiceActivity";

// Global styles the inline-style HUD can't express: the floating-emote keyframes (used by the
// <Html> overlays in Character3D) and the narrow-screen layout of the bottom HUD stack.
const GLOBAL_CSS = `
.cozy-emote {
  position: absolute;
  left: 0;
  bottom: 0;
  transform: translate(-50%, 0);
  font-size: 30px;
  line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
  animation: cozy-emote-float 1.9s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
  pointer-events: none;
  user-select: none;
}
@keyframes cozy-emote-float {
  0%   { opacity: 0; transform: translate(-50%, 10px) scale(0.4); }
  12%  { opacity: 1; transform: translate(-50%, -6px) scale(1.15); }
  25%  { transform: translate(-50%, -14px) scale(1); }
  75%  { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -70px) scale(0.9); }
}
.cozy-bottom-stack {
  position: absolute;
  left: 50%;
  bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 10;
}
/* On phones, keep the emote bar clear of the colour-picker puck in the bottom-right corner. */
@media (max-width: 480px) {
  .cozy-bottom-stack { left: 12px; transform: none; align-items: flex-start; }
}
`;

export default function App() {
  const { auth, loading: authLoading, error: authError } = useDiscordAuth();
  const {
    room,
    players,
    chairs,
    toggleables,
    localSessionId,
    currentMap,
    mapTransitioning,
    connected,
    error: roomError,
    setColor,
    changeMap,
    sendEmote,
    setSpeaking,
    roast,
    eat,
    dropHeld,
    subscribeEmotes,
  } = useColyseusRoom(auth);

  const voice = useVoiceActivity(auth, setSpeaking);

  // EmoteBar registers a keydown listener keyed on this callback; keep its identity stable.
  const sendEmoteRef = useRef(sendEmote);
  sendEmoteRef.current = sendEmote;
  const handleEmote = useCallback((emoji: string) => sendEmoteRef.current(emoji), []);

  if (authLoading) return <StatusScreen text="Connecting to Discord..." />;
  if (authError) return <StatusScreen text={`Auth error: ${authError}`} isError />;
  if (!connected) return <StatusScreen text="Joining room..." />;
  if (roomError) return <StatusScreen text={`Room error: ${roomError}`} isError />;

  const localPlayer = localSessionId ? players[localSessionId] : null;

  return (
    <div style={rootStyle}>
      <style>{GLOBAL_CSS}</style>

      <IsometricCanvas>
        <WorldScene
          room={room}
          players={players}
          chairs={chairs}
          toggleables={toggleables}
          localSessionId={localSessionId}
          mapId={currentMap}
          speakingUserIds={voice.speakingUserIds}
          subscribeEmotes={subscribeEmotes}
        />
      </IsometricCanvas>

      <MapSwitcherUI currentMap={currentMap} disabled={mapTransitioning} onSelect={changeMap} />

      <div style={topLeftStyle}>
        <PlayerRoster players={players} localSessionId={localSessionId} speakingUserIds={voice.speakingUserIds} />
      </div>
      <div style={topRightStyle}>
        <VoiceChip mode={voice.mode} active={voice.simulatedActive} onPressChange={voice.setSimulatedActive} />
      </div>

      {localPlayer && localSessionId && (
        <div className="cozy-bottom-stack">
          <ActivityBar
            player={localPlayer}
            chairs={chairs}
            localSessionId={localSessionId}
            onRoast={roast}
            onEat={eat}
            onSip={() => handleEmote("☕")}
            onPutDown={dropHeld}
          />
          <EmoteBar onEmote={handleEmote} />
        </div>
      )}

      {mapTransitioning && <StatusScreen text="Changing scene..." overlay />}

      {localPlayer && <ColorPickerUI currentColor={localPlayer.color} onSelect={setColor} />}
    </div>
  );
}

function StatusScreen({ text, isError, overlay }: { text: string; isError?: boolean; overlay?: boolean }) {
  return (
    <div
      style={{
        position: overlay ? "absolute" : "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: overlay ? "rgba(10, 10, 16, 0.7)" : "#0e0e16",
        color: isError ? "#ff6b6b" : "#e8e8f0",
        fontFamily: "sans-serif",
        fontSize: 16,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        maxWidth: 480,
        textAlign: "center",
        padding: 24,
        zIndex: 20,
      }}
    >
      {text}
    </div>
  );
}

const rootStyle: CSSProperties = {
  position: "relative",
  width: "100vw",
  height: "100vh",
  overflow: "hidden",
};

// Below the map switcher's row, so the three never collide on narrow screens.
const HUD_TOP = "calc(max(16px, env(safe-area-inset-top)) + 58px)";
const topLeftStyle: CSSProperties = { position: "absolute", top: HUD_TOP, left: 12, zIndex: 10 };
const topRightStyle: CSSProperties = { position: "absolute", top: HUD_TOP, right: 12, zIndex: 10 };
