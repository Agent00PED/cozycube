import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { IsometricCanvas } from "./scene/IsometricCanvas";
import { WorldScene } from "./components/WorldScene";
import { Header } from "./components/hud/Header";
import { WorldDrawer } from "./components/hud/WorldDrawer";
import { SideDrawer } from "./components/hud/SideDrawer";
import { SettingsPanel } from "./components/hud/SettingsPanel";
import { SlotsModal } from "./components/hud/SlotsModal";
import { BlackjackModal } from "./components/hud/BlackjackModal";
import { LeaderboardModal } from "./components/hud/LeaderboardModal";
import { Toasts } from "./components/hud/Toasts";
import { pushToast } from "./components/hud/toastStore";
import { Joystick } from "./components/hud/Joystick";
import { Wardrobe } from "./components/hud/Wardrobe";
import { loadSavedLook } from "./components/hud/lookStorage";
import { playWinBell } from "./audio/sfx";
import { getAudioSettings, installGestureUnlock, setAudioSettings, subscribeAudioSettings } from "./audio/SoundManager";
import { installKeyboard, isTouchDevice } from "./systems/input";
import { interactBridge } from "./scene/interactBridge";
import {
  ACHIEVEMENTS,
  BLACKJACK_CENTER,
  BLACKJACK_RADIUS,
  EMOTES,
  ROULETTE_BET_RADIUS,
  ROULETTE_CENTER,
  defaultLook,
  parseLook,
  parseStats,
  type BlackjackView,
} from "@shared/types";
import { ActionDock } from "./components/hud/ActionDock";
import { RoulettePanel } from "./components/hud/RoulettePanel";
import { ActivityBar } from "./components/hud/ActivityBar";
import { VoiceChip } from "./components/hud/VoiceChip";
import { RecenterButton } from "./components/hud/RecenterButton";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
import { useColyseusRoom } from "./hooks/useColyseusRoom";
import { useVoiceActivity } from "./hooks/useVoiceActivity";
import { useAmbience } from "./hooks/useAmbience";

// Global styles the inline-style HUD can't express: the floating-emote keyframes (used by the
// <Html> overlays in Character3D) and the narrow-screen layout of the bottom HUD stack.
const GLOBAL_CSS = `
.cozy-emote {
  position: absolute; left: 0; bottom: 0; transform: translate(-50%, 0);
  font-size: 30px; line-height: 1; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
  animation: cozy-emote-float 1.9s cubic-bezier(0.2, 0.7, 0.3, 1) forwards; pointer-events: none; user-select: none;
}
@keyframes cozy-emote-float {
  0%   { opacity: 0; transform: translate(-50%, 10px) scale(0.4); }
  12%  { opacity: 1; transform: translate(-50%, -6px) scale(1.15); }
  25%  { transform: translate(-50%, -14px) scale(1); }
  75%  { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -70px) scale(0.9); }
}
/* Speech bubbles over avatars and the NPC traders. */
.cozy-bubble, .cozy-chat-bubble {
  background: rgba(255, 250, 242, 0.96); color: #4a3a2c;
  font: 700 12.5px 'Nunito', system-ui, sans-serif; padding: 8px 12px; border-radius: 16px 16px 16px 4px;
  max-width: 220px; box-shadow: 0 6px 18px rgba(60, 40, 20, 0.28); pointer-events: none; user-select: none;
}
.cozy-bubble { transform: translate(-50%, -100%); white-space: nowrap; animation: cozy-bubble-in 180ms ease-out; }
.cozy-chat-bubble { white-space: normal; overflow-wrap: anywhere; text-align: center; }
.cozy-chat-bubble::after { content: ""; position: absolute; left: 50%; bottom: -7px; width: 14px; height: 14px; background: inherit; transform: translateX(-50%) rotate(45deg); border-radius: 3px; }
@keyframes cozy-bubble-in { from { opacity: 0; transform: translate(-50%, -80%) scale(0.9); } }
/* The bite mark over a fishing avatar: reel in NOW. */
.cozy-bite-mark { transform: translate(-50%, -100%); font: 900 26px system-ui, sans-serif; color: #fff; -webkit-text-stroke: 2px #d83a5a; text-shadow: 0 2px 6px rgba(0,0,0,0.4); animation: cozy-bite-mark 0.45s ease-in-out infinite alternate; pointer-events: none; }
@keyframes cozy-bite-mark { from { transform: translate(-50%, -100%) scale(1); } to { transform: translate(-50%, -125%) scale(1.25); } }
.cozy-coin-bump { animation: cozy-coin-bump 420ms cubic-bezier(0.3, 1.6, 0.5, 1); }
@keyframes cozy-coin-bump { 0% { transform: scale(1); } 40% { transform: scale(1.25); } 100% { transform: scale(1); } }
.cozy-bite { animation: cozy-bite 0.5s ease-in-out infinite alternate; }
@keyframes cozy-bite { from { transform: scale(1); } to { transform: scale(1.08); } }
@media (max-width: 560px) {
  .cozy-wardrobe { flex-direction: column; }
  .cozy-wardrobe-preview { flex: 0 0 200px !important; min-height: 200px !important; }
}
.cozy-speaking {
  position: absolute; left: 0; bottom: 0; transform: translate(-50%, 0); font-size: 20px; line-height: 1;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35)); animation: cozy-speaking-bob 0.9s ease-in-out infinite; pointer-events: none; user-select: none;
}
@keyframes cozy-speaking-bob { 0%, 100% { transform: translate(-50%, 0) rotate(-8deg); } 50% { transform: translate(-50%, -7px) rotate(8deg); } }
/* Proximity action buttons pop in and breathe so they are impossible to miss. */
.cozy-action { animation: cozy-action-in 220ms cubic-bezier(0.3, 1.5, 0.5, 1), cozy-action-glow 1.6s ease-in-out 220ms infinite alternate; }
.cozy-action:hover { transform: translateY(-2px) scale(1.04); }
.cozy-action:active { transform: scale(0.96); }
@keyframes cozy-action-in { from { opacity: 0; transform: translateY(10px) scale(0.8); } }
@keyframes cozy-action-glow { to { box-shadow: 0 4px 24px rgba(255, 190, 60, 0.85), inset 0 -2px 0 rgba(160, 90, 10, 0.25); } }
.cozy-bottom-stack {
  pointer-events: none; position: absolute; left: 50%; bottom: max(18px, env(safe-area-inset-bottom));
  transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; z-index: 10;
}
.cozy-bottom-stack > * { pointer-events: auto; }
.cozy-roulette { animation: cozy-menu-in 200ms ease-out; }
@media (max-width: 767px) {
  .cozy-roulette-wrap { left: 0 !important; right: 0 !important; bottom: 0 !important; transform: none !important; }
  .cozy-roulette { width: 100% !important; border-radius: 20px 20px 0 0 !important; padding: 8px 8px calc(8px + env(safe-area-inset-bottom)) !important; animation: cozy-sheet-up 240ms cubic-bezier(0.2, 0.9, 0.3, 1) !important; }
  .cozy-roulette .cozy-hint { display: none; }
  .cozy-roulette .cozy-felt-grid { grid-template-rows: repeat(3, 24px) !important; }
}
@keyframes cozy-sheet-up { from { transform: translateY(100%); } }
.cozy-confetti { position: absolute; left: 50%; top: 40%; width: 0; height: 0; pointer-events: none; }
.cozy-confetti i { position: absolute; width: 7px; height: 11px; border-radius: 2px; animation: cozy-confetti 1.2s cubic-bezier(0.2, 0.7, 0.4, 1) forwards; }
@keyframes cozy-confetti { 0% { transform: translate(0,0) rotate(0); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) rotate(540deg); opacity: 0; } }
.cozy-roulette button:not(:disabled):hover { filter: brightness(1.15); }
.cozy-roulette button:not(:disabled):active { transform: scale(0.94); }
.cozy-bob { display: inline-block; animation: cozy-bob 2.2s ease-in-out infinite; }
@keyframes cozy-bob { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg) translateY(2px); } }
/* With a joystick on the left, the bottom stack keeps to the centre-right on phones. */
@media (max-width: 560px) {
  .cozy-bottom-stack { left: auto; right: 12px; transform: none; align-items: flex-end; max-width: calc(100vw - 170px); }
  .cozy-bottom-stack.no-joystick { left: 12px; right: 12px; align-items: center; max-width: none; }
}
.cozy-menu { animation: cozy-menu-in 160ms ease-out; }
@keyframes cozy-menu-in { from { opacity: 0; transform: translateY(-6px) scale(0.97); } }
.cozy-status { transform: translate(-50%, -50%); background: rgba(40, 30, 22, 0.62); color: #fff6e6; font: 700 11px system-ui, sans-serif; padding: 3px 8px; border-radius: 999px; white-space: nowrap; pointer-events: none; user-select: none; }
.cozy-zzz { position: absolute; left: 10px; bottom: 8px; font: 800 13px system-ui, sans-serif; color: #dfe8ff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); animation: cozy-zzz 2.4s ease-out infinite; pointer-events: none; }
.cozy-zzz:nth-child(2) { animation-delay: 0.8s; }
.cozy-zzz:nth-child(3) { animation-delay: 1.6s; }
@keyframes cozy-zzz { 0% { opacity: 0; transform: translate(0, 0) scale(0.6); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(14px, -34px) scale(1.2); } }
@media (max-width: 768px) { .cozy-hud-label { display: none; } }
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
    leaderboard,
    latency,
    claimAllowance,
    spinSlots,
    blackjackAction,
    sendChat,
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
  const turntable = Object.values(toggleables).find((t) => t.kind === "turntable");
  const record = turntable?.on ? turntable.track : null;
  const ambience = useAmbience(currentMap, record);

  // Sound unlocks on the first gesture; WASD / arrows steer for the app's lifetime.
  useEffect(() => {
    installGestureUnlock();
    return installKeyboard();
  }, []);

  // --- panels ---
  const [worldsOpen, setWorldsOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [slotsProp, setSlotsProp] = useState<string | null>(null);
  const [blackjackOpen, setBlackjackOpen] = useState(false);
  const [blackjackView, setBlackjackView] = useState<BlackjackView | null>(null);
  const closeWardrobe = useCallback(() => setWardrobeOpen(false), []);

  // --- one-shot server messages: results, openings, welcomes ---
  const localIdRef = useRef(localSessionId);
  localIdRef.current = localSessionId;
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "rouletteResult") {
          const { winners } = payload as { result: number; winners: { sessionId: string; username: string; amount: number }[] };
          if (winners.length === 0) return;
          if (winners.some((w) => w.sessionId === localIdRef.current)) playWinBell();
          const best = [...winners].sort((a, b) => b.amount - a.amount)[0];
          pushToast(`${best.username} won ${best.amount} coins${winners.length > 1 ? ` (+${winners.length - 1} more)` : ""}`, { emoji: "🎉", tone: "win", silent: true });
        } else if (type === "openSlots") {
          setSlotsProp((payload as { propId: string }).propId);
        } else if (type === "blackjackState") {
          setBlackjackView(payload as BlackjackView);
          setBlackjackOpen(true);
        } else if (type === "allowance") {
          const a = payload as { ok: boolean; coins?: number; retryInS?: number };
          if (a.ok) pushToast(`The house tops you up: +${a.coins} coins`, { emoji: "🎁", tone: "coin" });
          else pushToast(`Allowance again in ${Math.ceil((a.retryInS ?? 0) / 60)} min`, { emoji: "⏳" });
        } else if (type === "welcome") {
          const w = payload as { isNew: boolean; coins: number };
          pushToast(w.isNew ? `Welcome to CozyCube! Here are ${w.coins} coins to start` : `Welcome back! Your ${w.coins} coins are right where you left them`, { emoji: w.isNew ? "🎀" : "👋", tone: "arrive" });
        }
      }),
    [subscribeMessages]
  );

  // Blackjack opens from the dock (walk up to the table first) and closes when you leave it.
  useEffect(() => {
    const open = () => setBlackjackOpen(true);
    window.addEventListener("cozy-open-blackjack", open);
    return () => window.removeEventListener("cozy-open-blackjack", open);
  }, []);

  // Put the remembered outfit back on once per connection, unless the database already has one.
  const restoredLookRef = useRef<unknown>(null);
  useEffect(() => {
    if (!room || !localSessionId || restoredLookRef.current === room) return;
    restoredLookRef.current = room;
    const me = players[localSessionId];
    if (me && me.look) return; // persisted look wins
    const saved = loadSavedLook();
    if (parseLook(saved)) setLook(saved!);
  }, [room, localSessionId, setLook, players]);

  const sendEmoteRef = useRef(sendEmote);
  sendEmoteRef.current = sendEmote;
  const handleEmote = useCallback((emoji: string) => sendEmoteRef.current(emoji), []);
  // number keys 1-6 still fire the quick emotes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < EMOTES.length && !e.repeat) handleEmote(EMOTES[index]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleEmote]);

  // --- toasts for the things worth celebrating: coins, milestones, arrivals ---
  const me = localSessionId ? players[localSessionId] : null;
  const prevCoins = useRef<number | null>(null);
  useEffect(() => {
    if (!me) return;
    if (prevCoins.current !== null) {
      const delta = me.coins - prevCoins.current;
      if (delta >= 5) pushToast(`+${delta} coins`, { emoji: "🪙", tone: "coin", silent: true });
    }
    prevCoins.current = me.coins;
  }, [me?.coins]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevStats = useRef<string | null>(null);
  useEffect(() => {
    if (!me) return;
    if (prevStats.current !== null && prevStats.current !== me.stats) {
      const before = parseStats(prevStats.current);
      const after = parseStats(me.stats);
      for (const a of ACHIEVEMENTS) if (before[a.stat] < a.at && after[a.stat] >= a.at) pushToast(`Achievement: ${a.title}`, { emoji: a.emoji, tone: "win" });
    }
    prevStats.current = me.stats;
  }, [me?.stats]); // eslint-disable-line react-hooks/exhaustive-deps
  const seenPlayers = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(Object.keys(players));
    if (seenPlayers.current) {
      for (const id of ids) {
        if (!seenPlayers.current.has(id) && id !== localSessionId) pushToast(`${players[id].username} arrived`, { emoji: "🚪", tone: "arrive", silent: true });
      }
    }
    seenPlayers.current = ids;
  }, [players, localSessionId]);

  // --- joystick: touch devices by default, or by preference ---
  const [joystickPref, setJoystickPref] = useState(getAudioSettings().joystick);
  useEffect(() => subscribeAudioSettings((s) => setJoystickPref(s.joystick)), []);
  const showJoystick = joystickPref === "on" || (joystickPref === "auto" && isTouchDevice());

  // --- table proximity: the roulette board and the blackjack panel follow you to the tables ---
  const atRoulette = currentMap === "velvet_casino" && !!me && !me.sitting && Math.hypot(me.x - ROULETTE_CENTER.x, me.z - ROULETTE_CENTER.z) < ROULETTE_BET_RADIUS;
  const atBlackjack = currentMap === "velvet_casino" && !!me && Math.hypot(me.x - BLACKJACK_CENTER.x, me.z - BLACKJACK_CENTER.z) < BLACKJACK_RADIUS + 0.5;
  const [rouletteClosed, setRouletteClosed] = useState(false);
  useEffect(() => {
    if (!atRoulette) setRouletteClosed(false);
  }, [atRoulette]);
  useEffect(() => {
    const reopen = () => setRouletteClosed(false);
    window.addEventListener("cozy-open-roulette", reopen);
    return () => window.removeEventListener("cozy-open-roulette", reopen);
  }, []);
  useEffect(() => {
    if (!atBlackjack) setBlackjackOpen(false);
  }, [atBlackjack]);
  useEffect(() => {
    if (currentMap !== "velvet_casino") {
      setSlotsProp(null);
      setBlackjackOpen(false);
      setBlackjackView(null);
    }
  }, [currentMap]);
  const showRoulette = atRoulette && !rouletteClosed && !blackjackOpen && !slotsProp;

  const playerCount = useMemo(() => Object.values(players).filter((p) => p.connected).length, [players]);

  if (authLoading) return <StatusScreen text="Connecting to Discord..." />;
  if (authError) return <StatusScreen text={`Auth error: ${authError}`} isError />;
  if (!connected) return <StatusScreen text="Joining room..." />;
  if (roomError) return <StatusScreen text={`Room error: ${roomError}`} isError />;

  const localPlayer = me;

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
          leaderboard={leaderboard}
          subscribeMessages={subscribeMessages}
        />
      </IsometricCanvas>

      <Header
        currentMap={currentMap}
        playerCount={playerCount}
        onOpenWorlds={() => setWorldsOpen(true)}
        timeOfDay={timeOfDay}
        onSelectTime={setTimeOfDay}
        autoCycle={autoCycle}
        onToggleAutoCycle={() => setAutoCycle(!autoCycle)}
        coins={localPlayer?.coins ?? 0}
        onClaimAllowance={claimAllowance}
        status={localPlayer?.status ?? ""}
        onSetStatus={setStatus}
        onOpenWardrobe={() => setWardrobeOpen(true)}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        soundOn={ambience.enabled}
        onToggleSound={() => setAudioSettings({ ambience: !getAudioSettings().ambience })}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSocial={() => setSocialOpen((o) => !o)}
        socialOpen={socialOpen}
      />
      <Toasts />

      <div style={voiceStyle}>
        <VoiceChip mode={voice.mode} active={voice.simulatedActive} onPressChange={voice.setSimulatedActive} />
      </div>

      {localPlayer && localSessionId && (
        <div className={`cozy-bottom-stack ${showJoystick ? "" : "no-joystick"}`}>
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
          <ActionDock rouletteOpen={showRoulette} player={localPlayer} mapId={currentMap} chairs={chairs} toggleables={toggleables} localSessionId={localSessionId} onCastLine={castLine} onRoast={roast} />
        </div>
      )}

      {showJoystick && localPlayer && (
        <div className="pointer-events-none fixed z-20" style={{ left: "max(16px, env(safe-area-inset-left))", bottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <Joystick />
        </div>
      )}

      {showRoulette && localPlayer && localSessionId && (
        <div className="cozy-roulette-wrap" style={roulettePanelStyle}>
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

      {worldsOpen && <WorldDrawer currentMap={currentMap} playerCount={playerCount} disabled={mapTransitioning} onSelect={changeMap} onClose={() => setWorldsOpen(false)} />}
      {socialOpen && (
        <SideDrawer
          players={players}
          localSessionId={localSessionId}
          speakingUserIds={voice.speakingUserIds}
          latency={latency}
          onEmote={handleEmote}
          onGesture={sendGesture}
          onSitNearest={() => {
            if (!interactBridge.current?.sitNearest()) pushToast("No free seat close by", { emoji: "🪑", silent: true });
          }}
          onChat={sendChat}
          onClose={() => setSocialOpen(false)}
        />
      )}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {leaderboardOpen && <LeaderboardModal leaderboard={leaderboard} players={players} localName={localPlayer?.username ?? ""} onClose={() => setLeaderboardOpen(false)} />}
      {slotsProp && localPlayer && localSessionId && (
        <SlotsModal propId={slotsProp} coins={localPlayer.coins} localSessionId={localSessionId} onSpin={spinSlots} subscribeMessages={subscribeMessages} onClose={() => setSlotsProp(null)} />
      )}
      {blackjackOpen && localPlayer && <BlackjackModal view={blackjackView} coins={localPlayer.coins} onAction={blackjackAction} onClose={() => setBlackjackOpen(false)} />}

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

const rootStyle: CSSProperties = { position: "relative", width: "100vw", height: "100vh", overflow: "hidden" };
const HUD_TOP = "calc(max(10px, env(safe-area-inset-top)) + 60px)";
const roulettePanelStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "calc(max(18px, env(safe-area-inset-bottom)) + 64px)",
  transform: "translateX(-50%)",
  zIndex: 14,
};
const voiceStyle: CSSProperties = { position: "absolute", top: HUD_TOP, right: 12, zIndex: 10 };
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
