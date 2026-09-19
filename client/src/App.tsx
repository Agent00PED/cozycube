import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { IsometricCanvas } from "./scene/IsometricCanvas";
import { WorldScene } from "./components/WorldScene";
import { TopBar } from "./components/hud/TopBar";
import { Wardrobe } from "./components/hud/Wardrobe";
import { loadSavedLook } from "./components/hud/lookStorage";
import { setSfxMuted } from "./audio/sfx";
import { defaultLook, parseLook } from "@shared/types";
import { EmoteBar } from "./components/hud/EmoteBar";
import { ActivityBar } from "./components/hud/ActivityBar";
import { VoiceChip } from "./components/hud/VoiceChip";
import { PlayerRoster } from "./components/hud/PlayerRoster";
import { RecenterButton } from "./components/hud/RecenterButton";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
import { useColyseusRoom } from "./hooks/useColyseusRoom";
import { useVoiceActivity } from "./hooks/useVoiceActivity";
import { useAmbience } from "./hooks/useAmbience";

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
/* Wardrobe stacks preview over pickers on a phone-width window. */
@media (max-width: 560px) {
  .cozy-wardrobe { flex-direction: column; }
  .cozy-wardrobe-preview { flex: 0 0 200px !important; min-height: 200px !important; }
}
/* The note that bobs over a player's head while they talk. */
.cozy-speaking {
  position: absolute;
  left: 0;
  bottom: 0;
  transform: translate(-50%, 0);
  font-size: 20px;
  line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
  animation: cozy-speaking-bob 0.9s ease-in-out infinite;
  pointer-events: none;
  user-select: none;
}
@keyframes cozy-speaking-bob {
  0%, 100% { transform: translate(-50%, 0) rotate(-8deg); }
  50% { transform: translate(-50%, -7px) rotate(8deg); }
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
/* Text labels are the first thing to drop when the HUD gets tight — the emoji still say which
   is which, and the bar keeps fitting one row on a phone-width Discord panel. */
@media (max-width: 720px) {
  .cozy-hud-label { display: none; }
  .cozy-topbar { gap: 2px; padding: 4px; }
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
    timeOfDay,
    mapTransitioning,
    connected,
    error: roomError,
    setLook,
    changeMap,
    setTimeOfDay,
    sendEmote,
    setSpeaking,
    roast,
    eat,
    dropHeld,
    kickBall,
    castLine,
    reelIn,
    ballRef,
    subscribeEmotes,
  } = useColyseusRoom(auth);

  const voice = useVoiceActivity(auth, setSpeaking);
  // The lounge's turntable decides what the room plays (null while it is off).
  const turntable = Object.values(toggleables).find((t) => t.kind === "turntable");
  const record = turntable?.on ? turntable.track : null;
  const ambience = useAmbience(currentMap, record);
  setSfxMuted(!ambience.enabled);

  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const closeWardrobe = useCallback(() => setWardrobeOpen(false), []);
  // Put the remembered outfit back on once per connection (the room forgets it on leave).
  const restoredLookRef = useRef<unknown>(null);
  useEffect(() => {
    if (!room || !localSessionId || restoredLookRef.current === room) return;
    restoredLookRef.current = room;
    const saved = loadSavedLook();
    if (parseLook(saved)) setLook(saved!);
  }, [room, localSessionId, setLook]);

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
          timeOfDay={timeOfDay}
          speakingUserIds={voice.speakingUserIds}
          subscribeEmotes={subscribeEmotes}
          ballRef={ballRef}
          onKickBall={kickBall}
        />
      </IsometricCanvas>

      <TopBar
        currentMap={currentMap}
        mapDisabled={mapTransitioning}
        onSelectMap={changeMap}
        timeOfDay={timeOfDay}
        onSelectTime={setTimeOfDay}
        onOpenWardrobe={() => setWardrobeOpen(true)}
        soundOn={ambience.enabled}
        onToggleSound={ambience.toggle}
      />

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
            onCastLine={castLine}
            onReelIn={reelIn}
          />
          <EmoteBar onEmote={handleEmote} />
        </div>
      )}

      {mapTransitioning && <StatusScreen text="Changing scene..." overlay />}

      <div style={bottomRightStyle}>
        <RecenterButton />
      </div>

      {wardrobeOpen && localPlayer && (
        <Wardrobe
          userId={localPlayer.userId}
          username={localPlayer.username}
          initial={parseLook(localPlayer.look) ?? defaultLook(localPlayer.userId || localPlayer.username, localPlayer.color)}
          onApply={setLook}
          onClose={closeWardrobe}
        />
      )}
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

// Below the single top bar, so nothing collides on a narrow Discord window.
const HUD_TOP = "calc(max(12px, env(safe-area-inset-top)) + 54px)";
const topLeftStyle: CSSProperties = { position: "absolute", top: HUD_TOP, left: 12, zIndex: 10 };
const topRightStyle: CSSProperties = {
  position: "absolute",
  top: HUD_TOP,
  right: 12,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 8,
};
// The two round corner buttons: recenter sits above the colour puck so neither covers the other.
const bottomRightStyle: CSSProperties = {
  position: "absolute",
  right: "max(16px, env(safe-area-inset-right))",
  bottom: "max(16px, env(safe-area-inset-bottom))",
  zIndex: 12,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};
