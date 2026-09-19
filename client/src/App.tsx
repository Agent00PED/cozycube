import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { IsometricCanvas } from "./scene/IsometricCanvas";
import { WorldScene } from "./components/WorldScene";
import { TopBar } from "./components/hud/TopBar";
import { Wardrobe } from "./components/hud/Wardrobe";
import { loadSavedLook } from "./components/hud/lookStorage";
import { playWinBell, setSfxMuted } from "./audio/sfx";
import { ROULETTE_BET_RADIUS, ROULETTE_CENTER, defaultLook, parseLook } from "@shared/types";
import { EmoteBar } from "./components/hud/EmoteBar";
import { ActionDock } from "./components/hud/ActionDock";
import { RoulettePanel } from "./components/hud/RoulettePanel";
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
/* Speech bubbles over the NPC traders. */
.cozy-bubble {
  transform: translate(-50%, -100%);
  background: rgba(255, 250, 242, 0.95);
  color: #4a3a2c;
  font: 600 12.5px system-ui, sans-serif;
  padding: 7px 11px;
  border-radius: 14px;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(60, 40, 20, 0.25);
  animation: cozy-bubble-in 180ms ease-out;
}
@keyframes cozy-bubble-in { from { opacity: 0; transform: translate(-50%, -80%) scale(0.9); } }
/* The wallet pops when coins come in. */
.cozy-coin-bump { animation: cozy-coin-bump 420ms cubic-bezier(0.3, 1.6, 0.5, 1); }
@keyframes cozy-coin-bump { 0% { transform: scale(1); } 40% { transform: scale(1.25); } 100% { transform: scale(1); } }
/* A fish on the line: the reel button throbs. */
.cozy-bite { animation: cozy-bite 0.5s ease-in-out infinite alternate; }
@keyframes cozy-bite { from { transform: scale(1); } to { transform: scale(1.08); } }
/* Room-wide announcements (roulette winners). */
.cozy-toast {
  position: absolute;
  top: calc(max(12px, env(safe-area-inset-top)) + 58px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  background: rgba(58, 36, 21, 0.88);
  color: #ffe8b0;
  font: 700 13.5px system-ui, sans-serif;
  padding: 9px 16px;
  border-radius: 999px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.3);
  animation: cozy-bubble-in 220ms ease-out;
  pointer-events: none;
  white-space: nowrap;
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
/* Speech bubbles and toasts never swallow a click meant for the world under them. */
.cozy-bubble { pointer-events: none; }
/* Proximity action buttons pop in and breathe so they are impossible to miss. */
.cozy-action { animation: cozy-action-in 220ms cubic-bezier(0.3, 1.5, 0.5, 1), cozy-action-glow 1.6s ease-in-out 220ms infinite alternate; }
.cozy-action:hover { transform: translateY(-2px) scale(1.04); }
.cozy-action:active { transform: scale(0.96); }
@keyframes cozy-action-in { from { opacity: 0; transform: translateY(10px) scale(0.8); } }
@keyframes cozy-action-glow { to { box-shadow: 0 4px 24px rgba(255, 190, 60, 0.85), inset 0 -2px 0 rgba(160, 90, 10, 0.25); } }
.cozy-bottom-stack {
  pointer-events: none;
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
.cozy-bottom-stack > * { pointer-events: auto; }
.cozy-roulette { animation: cozy-menu-in 200ms ease-out; }
.cozy-roulette button:not(:disabled):hover { filter: brightness(1.15); }
.cozy-roulette button:not(:disabled):active { transform: scale(0.94); }
/* the rod bobbing while chill-fishing */
.cozy-bob { display: inline-block; animation: cozy-bob 2.2s ease-in-out infinite; }
@keyframes cozy-bob { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg) translateY(2px); } }
/* On phones, keep the emote bar clear of the colour-picker puck in the bottom-right corner. */
@media (max-width: 480px) {
  .cozy-bottom-stack { left: 12px; transform: none; align-items: flex-start; }
}
/* Text labels are the first thing to drop when the HUD gets tight — the emoji still say which
   is which, and the bar keeps fitting one row on a phone-width Discord panel. */
/* The emote tray slides up out of its button, and folds away again. */
.cozy-tray { transform-origin: bottom left; transform: translateY(12px) scale(0.92); opacity: 0; pointer-events: none; transition: transform 200ms cubic-bezier(0.3, 1.4, 0.5, 1), opacity 150ms ease; }
.cozy-tray-open { transform: none; opacity: 1; pointer-events: auto; }
.cozy-menu { animation: cozy-menu-in 160ms ease-out; }
@keyframes cozy-menu-in { from { opacity: 0; transform: translateY(-6px) scale(0.97); } }
/* Status badge over a head, and the Zzz of anyone AFK. */
.cozy-status { transform: translate(-50%, -50%); background: rgba(40, 30, 22, 0.62); color: #fff6e6; font: 700 11px system-ui, sans-serif; padding: 3px 8px; border-radius: 999px; white-space: nowrap; pointer-events: none; user-select: none; }
.cozy-zzz { position: absolute; left: 10px; bottom: 8px; font: 800 13px system-ui, sans-serif; color: #dfe8ff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); animation: cozy-zzz 2.4s ease-out infinite; pointer-events: none; }
.cozy-zzz:nth-child(2) { animation-delay: 0.8s; }
.cozy-zzz:nth-child(3) { animation-delay: 1.6s; }
@keyframes cozy-zzz { 0% { opacity: 0; transform: translate(0, 0) scale(0.6); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(14px, -34px) scale(1.2); } }
@media (max-width: 768px) {
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
    roulette,
    bets,
    autoCycle,
    setAutoCycle,
    sendGesture,
    buyHat,
    placeBet,
    clearBets,
    subscribeMessages,
    changeMap,
    setTimeOfDay,
    sendEmote,
    setSpeaking,
    roast,
    eat,
    dropHeld,
    kickBall,
    castLine,
    setStatus,
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

  // Roulette results: a toast for the room, and a bell if you won.
  const [toast, setToast] = useState<string | null>(null);
  const localIdRef = useRef(localSessionId);
  localIdRef.current = localSessionId;
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type !== "rouletteResult") return;
        const { winners } = payload as { result: number; winners: { sessionId: string; username: string; amount: number }[] };
        if (winners.length === 0) return;
        if (winners.some((w) => w.sessionId === localIdRef.current)) playWinBell();
        const best = [...winners].sort((a, b) => b.amount - a.amount)[0];
        setToast(`🎉 ${best.username} won ${best.amount} 🪙${winners.length > 1 ? ` (+${winners.length - 1} more)` : ""}`);
      }),
    [subscribeMessages]
  );
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);
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

  // The roulette board opens by itself when you step up to the table, can be closed, and comes
  // back from the action dock (or on your next visit to the table).
  const me = localSessionId ? players[localSessionId] : null;
  const atRoulette =
    currentMap === "velvet_casino" &&
    !!me &&
    !me.sitting &&
    Math.hypot(me.x - ROULETTE_CENTER.x, me.z - ROULETTE_CENTER.z) < ROULETTE_BET_RADIUS;
  const [rouletteClosed, setRouletteClosed] = useState(false);
  useEffect(() => {
    if (!atRoulette) setRouletteClosed(false);
  }, [atRoulette]);
  useEffect(() => {
    const reopen = () => setRouletteClosed(false);
    window.addEventListener("cozy-open-roulette", reopen);
    return () => window.removeEventListener("cozy-open-roulette", reopen);
  }, []);
  const showRoulette = atRoulette && !rouletteClosed;

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
          roulette={roulette}
          bets={bets}
          subscribeMessages={subscribeMessages}
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
        coins={localPlayer?.coins ?? 0}
        autoCycle={autoCycle}
        onToggleAutoCycle={() => setAutoCycle(!autoCycle)}
        status={localPlayer?.status ?? ""}
        onSetStatus={setStatus}
      />
      {toast && <div className="cozy-toast">{toast}</div>}

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
            mapId={currentMap}
            roulette={roulette}
            myBets={bets[localSessionId] ?? ""}
            onPlaceBet={placeBet}
            onClearBets={clearBets}
            onRoast={roast}
            onEat={eat}
            onSip={() => handleEmote("☕")}
            onPutDown={dropHeld}
            onCastLine={castLine}
            onReelIn={reelIn}
          />
          <ActionDock rouletteOpen={showRoulette} player={localPlayer} mapId={currentMap} chairs={chairs} toggleables={toggleables} localSessionId={localSessionId} onCastLine={castLine} />
        </div>
      )}

      {localPlayer && <EmoteBar onEmote={handleEmote} onGesture={sendGesture} />}

      {showRoulette && localPlayer && localSessionId && (
        <div style={roulettePanelStyle}>
          <RoulettePanel
            roulette={roulette}
            myBets={bets[localSessionId] ?? ""}
            coins={localPlayer.coins}
            localSessionId={localSessionId}
            onPlaceBet={placeBet}
            onClearBets={clearBets}
            subscribeMessages={subscribeMessages}
            onClose={() => setRouletteClosed(true)}
          />
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
          coins={localPlayer.coins}
          owned={localPlayer.owned}
          onBuy={buyHat}
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
// Above the action dock, centred: the roulette board.
const roulettePanelStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "calc(max(18px, env(safe-area-inset-bottom)) + 64px)",
  transform: "translateX(-50%)",
  zIndex: 14,
};
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
