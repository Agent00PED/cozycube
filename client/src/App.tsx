import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Header, MAP_LABELS } from "./components/hud/Header";
import { WorldDrawer } from "./components/hud/WorldDrawer";
import { SideDrawer } from "./components/hud/SideDrawer";
import { SettingsPanel } from "./components/hud/SettingsPanel";
import { SlotsModal } from "./components/hud/SlotsModal";
import { BlackjackModal } from "./components/hud/BlackjackModal";
import { LeaderboardModal } from "./components/hud/LeaderboardModal";
import { Toasts } from "./components/hud/Toasts";
import { pushToast } from "./components/hud/toastStore";
import { IsometricCanvas } from "./scene/IsometricCanvas";
import { LoadingScreen, type LoadStage } from "./components/LoadingScreen";
import { ReconnectingPill } from "./components/hud/ReconnectingPill";
import { WorldScene } from "./scene/WorldScene";
import { interactBridge } from "./scene/interactBridge";
import { cameraFocus } from "./scene/cameraFocus";
import { MochiPlayroomModal } from "./entities/MochiPlayroomModal";
import { ActionDock } from "./components/hud/ActionDock";
import { Joystick } from "./components/hud/Joystick";
import { Wardrobe } from "./components/hud/Wardrobe";
import { loadSavedLook } from "./components/hud/lookStorage";
import { FishingModal } from "./components/hud/FishingModal";
import { GachaModal } from "./components/hud/GachaModal";
import { ClawModal } from "./components/hud/ClawModal";
import { RetroGameModal } from "./components/hud/RetroGameModal";
import { WishModal } from "./components/hud/WishModal";
import { MatchaModal } from "./components/hud/MatchaModal";
import { BlenderModal } from "./components/hud/BlenderModal";
import { JukeboxModal } from "./components/hud/JukeboxModal";
import { BoardGameModal } from "./components/hud/BoardGameModal";
import { KitchenModal } from "./components/hud/KitchenModal";
import { RadioModal } from "./components/hud/RadioModal";
import { useRadio } from "./hooks/useRadio";
import { RoastingModal } from "./components/hud/RoastingModal";
import { StargazingModal } from "./components/hud/StargazingModal";
import { WoodChopModal } from "./components/hud/WoodChopModal";
import { useWorldAmbience } from "./audio/ambience";
import { playSfx } from "./audio/sfx";
import { FORAGE_INFO, ITEMS, STARLIGHT_CATCHES, TREASURE_COINS, type FishCaught, type ForageResult, type RoastResult, type StarlightReel } from "@shared/types";
import { BoxingHud } from "./components/hud/BoxingHud";
import { installKeyboard, isTouchDevice } from "./systems/input";
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
  type BoardGameView,
  type FishOnLine,
  type GachaPrize,
  type MochiAction,
  type HairStyle,
  type OutfitId,
  type PremiumHat,
} from "@shared/types";
import { RoulettePanel } from "./components/hud/RoulettePanel";
import { ActivityBar } from "./components/hud/ActivityBar";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
import { useColyseusRoom } from "./hooks/useColyseusRoom";
import { useVoiceActivity } from "./hooks/useVoiceActivity";

// Global styles the inline-style HUD can't express: the floating-emote keyframes (used by the
// <Html> overlays in Character3D) and the narrow-screen layout of the bottom HUD stack.
const GLOBAL_CSS = `
.cozy-emote {
  position: absolute; left: 0; bottom: 0; transform: translate(-50%, 0);
  display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 999px;
  background: rgba(255, 250, 242, 0.96); box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 -2px 0 rgba(74,58,44,0.12);
  font-size: 24px; line-height: 1;
  animation: cozy-emote-bubble 3s cubic-bezier(0.2, 0.7, 0.3, 1) forwards; pointer-events: none; user-select: none;
}
.cozy-emote::after {
  content: ""; position: absolute; left: 50%; bottom: -5px; width: 10px; height: 10px; background: inherit;
  transform: translateX(-50%) rotate(45deg); border-radius: 2px; z-index: -1;
}
@keyframes cozy-emote-bubble {
  0%   { opacity: 0; transform: translate(-50%, 8px) scale(0.3); }
  8%   { opacity: 1; transform: translate(-50%, -4px) scale(1.18); }
  14%  { transform: translate(-50%, -8px) scale(1); }
  45%  { transform: translate(-50%, -14px) scale(1); }
  80%  { opacity: 1; transform: translate(-50%, -22px) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -34px) scale(0.9); }
}
/* Speech bubbles over avatars and the NPC traders. */
.cozy-bubble, .cozy-chat-bubble {
  background: rgba(255, 250, 242, 0.96); color: #4a3a2c;
  font: 600 13px var(--font-cozy); padding: 8px 14px; border-radius: 999px;
  box-shadow: 0 6px 18px rgba(60, 40, 20, 0.28), inset 0 -2px 0 rgba(60, 40, 20, 0.08); pointer-events: none; user-select: none;
  /* one line, always: the <Html> overlay has no intrinsic width, so without these a short word
     like "brb" would wrap into a column of single letters */
  white-space: nowrap; min-width: fit-content; width: max-content; max-width: none; display: inline-block;
}
.cozy-bubble { transform: translate(-50%, -100%); animation: cozy-bubble-in 180ms ease-out; }
.cozy-chat-bubble { text-align: center; }
.cozy-chat-bubble::after { content: ""; position: absolute; left: 50%; bottom: -6px; width: 12px; height: 12px; background: inherit; transform: translateX(-50%) rotate(45deg); border-radius: 2px; }
@keyframes cozy-bubble-in { from { opacity: 0; transform: translate(-50%, -80%) scale(0.9); } }
/* The bite mark over a fishing avatar: reel in NOW. */
.cozy-bite-mark { transform: translate(-50%, -100%); font: 700 26px var(--font-cozy); color: #fff; -webkit-text-stroke: 2px #d83a5a; text-shadow: 0 2px 6px rgba(0,0,0,0.4); animation: cozy-bite-mark 0.45s ease-in-out infinite alternate; pointer-events: none; }
@keyframes cozy-bite-mark { from { transform: translate(-50%, -100%) scale(1); } to { transform: translate(-50%, -125%) scale(1.25); } }
.cozy-coin-bump { animation: cozy-coin-bump 420ms cubic-bezier(0.3, 1.6, 0.5, 1); }
@keyframes cozy-coin-bump { 0% { transform: scale(1); } 40% { transform: scale(1.25); } 100% { transform: scale(1); } }
.cozy-bite { animation: cozy-bite 0.5s ease-in-out infinite alternate; }
@keyframes cozy-bite { from { transform: scale(1); } to { transform: scale(1.08); } }
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
/* Mochi in her playroom: chewing a treat, purring under a scritch */
.cozy-chew { animation: cozy-chew 0.32s ease-in-out infinite; }
@keyframes cozy-chew { 0%, 100% { transform: translate(-50%, -50%) scaleY(1); } 50% { transform: translate(-50%, -50%) scaleY(0.86) rotate(2deg); } }
.cozy-purr { animation: cozy-purr 0.18s ease-in-out infinite; }
@keyframes cozy-purr { 0%, 100% { transform: translate(-50%, -50%) translateX(-1px); } 50% { transform: translate(-50%, -50%) translateX(1px) rotate(-1deg); } }
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
    connectionIssue,
    reconnect,
    reconnecting,
    retryNow,
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
    buyOutfit,
    buyHair,
    pullGacha,
    clawPlay,
    arcadeScore,
    hook,
    catchFish,
    boxingEnter,
    boxingExit,
    punch,
    tossCoin,
    splash,
    makeWish,
    matchaWhisk,
    blendDrink,
    setRecord,
    boardSend,
    kitchenSend,
    radioSend,
    plantSend,
    campfireSend,
    groundSit,
    mochiPlay,
  } = useColyseusRoom(auth);

  const voice = useVoiceActivity(auth, setSpeaking);
  const turntable = Object.values(toggleables).find((t) => t.kind === "turntable");
  // the lounge radio, heard here: follows the room's station, with this player's own volume
  const radio = useRadio(toggleables);
  const record = turntable?.on ? turntable.track : null;

  // WASD / arrows steer for the app's lifetime.
  useEffect(() => {
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

  // --- titan infinity panels: whichever prop you walked up to (openPanel), and its results ---
  const [panel, setPanel] = useState<{ kind: string; propId: string } | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const [fishOnLine, setFishOnLine] = useState<FishOnLine | null>(null);
  const closeFishing = useCallback(() => setFishOnLine(null), []);
  // the campfire's reel: a fish on the line at the dock
  const [starReel, setStarReel] = useState<StarlightReel | null>(null);
  const closeStarReel = useCallback(() => setStarReel(null), []);
  const [gachaResult, setGachaResult] = useState<GachaPrize | null>(null);
  const [clawResult, setClawResult] = useState<{ won: boolean; target: number } | null>(null);
  const [arcadeResult, setArcadeResult] = useState<{ coins: number } | null>(null);
  const [wishResult, setWishResult] = useState<{ fortune: string; lucky: number } | null>(null);
  const [matchaResult, setMatchaResult] = useState<{ coins: number } | null>(null);
  const [blendResult, setBlendResult] = useState<{ right: boolean; coins: number } | null>(null);
  const [boardView, setBoardView] = useState<BoardGameView | null>(null);
  const [mochiResult, setMochiResult] = useState<{ action: MochiAction; coins: number; cooldown: boolean } | null>(null);
  const openPanel = useCallback((kind: string, propId: string) => {
    // a fresh panel starts with no stale result from last time
    setGachaResult(null);
    setClawResult(null);
    setArcadeResult(null);
    setWishResult(null);
    setMatchaResult(null);
    setBlendResult(null);
    setMochiResult(null);
    setPanel({ kind, propId });
  }, []);
  useEffect(() => {
    const open = (e: Event) => {
      const d = (e as CustomEvent<{ kind: string; propId: string }>).detail;
      if (d) openPanel(d.kind, d.propId);
    };
    window.addEventListener("cozy-open-panel", open);
    return () => window.removeEventListener("cozy-open-panel", open);
  }, [openPanel]);

  // --- one-shot server messages: results, openings, welcomes ---
  const localIdRef = useRef(localSessionId);
  // the world's ambient soundscape (the campfire's), faded in and out with the world
  useWorldAmbience(currentMap);
  // which panel is open, for the message handler below (a roast's result shows in its own panel)
  const panelKindRef = useRef<string | undefined>(undefined);
  panelKindRef.current = panel?.kind;
  localIdRef.current = localSessionId;
  useEffect(
    () =>
      subscribeMessages((type, payload) => {
        if (type === "rouletteResult") {
          const { winners } = payload as { result: number; winners: { sessionId: string; username: string; amount: number }[] };
          if (winners.length === 0) return;
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
        } else if (type === "openPanel") {
          const p = payload as { kind: string; propId: string };
          openPanel(p.kind, p.propId);
        } else if (type === "fishOnLine") {
          setFishOnLine(payload as FishOnLine);
        } else if (type === "starlightReel") {
          setStarReel(payload as StarlightReel);
        } else if (type === "gachaResult") {
          setGachaResult(payload as GachaPrize);
        } else if (type === "clawResult") {
          setClawResult(payload as { won: boolean; target: number });
        } else if (type === "arcadeResult") {
          setArcadeResult(payload as { coins: number });
        } else if (type === "wishResult") {
          setWishResult(payload as { fortune: string; lucky: number });
        } else if (type === "matchaResult") {
          setMatchaResult(payload as { coins: number });
        } else if (type === "blendResult") {
          setBlendResult(payload as { right: boolean; coins: number });
        } else if (type === "boardState") {
          setBoardView(payload as BoardGameView);
        } else if (type === "fishCaught") {
          // the campfire's river: what you pulled out, and what it paid
          const c = payload as FishCaught;
          if (c.sessionId === localIdRef.current) {
            const info = STARLIGHT_CATCHES[c.catchId];
            pushToast(c.coins > 0 ? `${info.name}! +${c.coins} coins` : `${info.name}! (the river's coins are all earned today)`, { emoji: info.emoji, tone: c.coins > 0 ? "coin" : undefined });
            if (c.treasure > 0) pushToast(`Sunken treasure! +${c.treasure} coins`, { emoji: "🧰", tone: "coin" });
            playSfx("catch");
          }
        } else if (type === "roastResult") {
          const r = payload as RoastResult;
          if (r.sessionId === localIdRef.current) {
            playSfx(r.quality === "golden" ? "golden" : r.quality === "charred" ? "burnt" : "catch");
            // left in the fire with its panel closed: say how it came out
            if (panelKindRef.current !== "roast") pushToast(r.quality === "golden" ? `Golden! +${r.coins} coins` : r.quality === "charred" ? "Oops, charcoal!" : "A little pale, still tasty", { emoji: r.quality === "charred" ? "🔥" : "🍡" });
          }
        } else if (type === "plantWatered") {
          const w = payload as { sessionId: string; coins: number };
          if (w.sessionId === localIdRef.current) pushToast(`The plant drinks it up! +${w.coins} coins`, { emoji: "🪴", tone: "coin" });
        } else if (type === "forageResult") {
          const f = payload as ForageResult;
          if (f.sessionId === localIdRef.current) {
            playSfx("pluck");
            const info = FORAGE_INFO[f.kind];
            pushToast(f.coins > 0 ? `${info.name}! +${f.coins} coins` : `${info.name}! (today's foraging coins are all earned)`, { emoji: info.emoji, tone: f.coins > 0 ? "coin" : undefined });
          }
        } else if (type === "campfireNotice") {
          // the campfire said no, kindly (a taken fishing spot, the hour it keeps)
          const n = payload as { message?: string; emoji?: string };
          pushToast(String(n?.message ?? ""), { emoji: n?.emoji ?? "🔥" });
        } else if (type === "boardError" || type === "serverError") {
          // the server refused or could not do what we asked (an illegal move): say so, gently
          pushToast(String((payload as { message?: string })?.message ?? "Something went wrong"), { emoji: type === "boardError" ? "♟️" : "⚠️" });
        } else if (type === "plantHappy") {
          pushToast("The plant is happy and hydrated!", { emoji: "🌿" });
        } else if (type === "mochiResult") {
          setMochiResult(payload as { action: MochiAction; coins: number; cooldown: boolean });
        } else if (type === "boxingResult") {
          const r = payload as { winner: string; winnerName: string; loser: string; loserName: string; purse: number };
          pushToast(`${r.winnerName} knocked out ${r.loserName}! +${r.purse} purse`, { emoji: "🥊", tone: "win", silent: true });
        } else if (type === "punch") {
          const p = payload as { from: string; to: string; hits: number };
        } else if (type === "dailyComplete") {
          pushToast(`Daily checklist done! +${(payload as { coins: number }).coins} coins`, { emoji: "📋", tone: "win" });
        } else if (type === "vibe") {
          const v = payload as { coins: number; party: boolean };
          pushToast(v.party ? `Party vibes: +${v.coins} coins for hanging out together` : `Cozy vibes: +${v.coins} coins for hanging out`, { emoji: v.party ? "🎉" : "🕯️", tone: "coin" });
        }
      }),
    [subscribeMessages, openPanel]
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

  // --- joystick: touch devices only ---
  const showJoystick = isTouchDevice();

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
    // fast travel closes whatever was open in the old world
    setPanel(null);
    setFishOnLine(null);
    setBoardView(null);
  }, [currentMap]);
  // the reel closes by itself if the server gave up on the line (timeout) or you stood up
  useEffect(() => {
    if (me && me.action !== "reel") setFishOnLine(null);
    // the campfire's reel shows its result while the line goes back in ("fish"); only leaving the
    // dock (no action at all) closes it
    if (me && me.action === "") setStarReel(null);
  }, [me?.action]); // eslint-disable-line react-hooks/exhaustive-deps
  const showRoulette = atRoulette && !rouletteClosed && !blackjackOpen && !slotsProp;

  const playerCount = useMemo(() => Object.values(players).filter((p) => p.connected).length, [players]);

  // The cozy loading screen covers the Discord handshake, the room join and the models loading.
  // It is the second child of the same fragment on every path below, so React keeps it as one
  // element from the first frame until it fades out over the lounge. A join that fails or a
  // connection that drops stays on the room stage while useColyseusRoom retries; after a while the
  // screen says so and offers Reconnect (it never waits silently forever).
  const loadStage: LoadStage = authLoading ? "discord" : authError ? "error" : !connected ? "room" : "assets";
  const loadError = authError ? `Couldn't reach Discord: ${authError}` : undefined;
  if (loadStage !== "assets")
    return (
      <>
        {null}
        <LoadingScreen stage={loadStage} error={loadError} issue={connectionIssue ?? undefined} onReconnect={reconnect} />
      </>
    );

  const localPlayer = me;

  return (
    <>
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
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSocial={() => setSocialOpen((o) => !o)}
          socialOpen={socialOpen}
        />
        <Toasts />
        <ReconnectingPill active={reconnecting} place={MAP_LABELS[currentMap]?.name ?? "the lounge"} onRetry={retryNow} />

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
              onHook={hook}
              onSplash={splash}
            />
            {currentMap === "boxing_ring" && <BoxingHud me={localPlayer} players={players} onPunch={punch} onExit={boxingExit} onToss={tossCoin} />}
            <ActionDock player={localPlayer} players={players} mapId={currentMap} chairs={chairs} toggleables={toggleables} localSessionId={localSessionId} onWater={(plantId) => plantSend({ type: "PLANT_WATER", plantId })} onCampfire={campfireSend} />
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

        {worldsOpen && <WorldDrawer currentMap={currentMap} playerCount={playerCount} disabled={mapTransitioning} onSelect={changeMap} onClose={() => setWorldsOpen(false)} />}
        {socialOpen && (
          <SideDrawer
            players={players}
            localSessionId={localSessionId}
            speakingUserIds={voice.speakingUserIds}
            latency={latency}
            onEmote={handleEmote}
            onGesture={sendGesture}
            mapId={currentMap}
            onSitNearest={() => {
              // a free seat in reach: sit on it; otherwise, cross-legged right here on the ground
              if (interactBridge.current?.sitNearest()) return;
              const me = localSessionId ? players[localSessionId] : null;
              if (me && !me.sitting && me.action === "") groundSit(cameraFocus.facing);
              else pushToast("Not while you're busy", { emoji: "🪑", silent: true });
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

        {/* the world's own panels */}
        {fishOnLine && (
          <FishingModal
            fish={{ emoji: fishOnLine.item === "boot" ? "🥾" : ITEMS[fishOnLine.item].emoji, name: fishOnLine.item === "boot" ? "old boot" : ITEMS[fishOnLine.item].name.toLowerCase(), speed: fishOnLine.speed, size: fishOnLine.size, hint: fishOnLine.water === "ocean" ? "Something from the sea" : "Something from the river" }}
            onResult={catchFish}
            onClose={closeFishing}
          />
        )}
        {starReel && (
          <FishingModal
            key={`${starReel.catchId}:${localSessionId}`}
            fish={{ ...STARLIGHT_CATCHES[starReel.catchId], hint: "Something from the starlit river", reward: STARLIGHT_CATCHES[starReel.catchId].coins, treasure: starReel.treasure, treasureReward: TREASURE_COINS }}
            onResult={(result, _quality, openedChest) => campfireSend({ type: "REEL_DONE", caught: result === "caught", treasure: openedChest })}
            onClose={closeStarReel}
            autoCloseMs={2200}
          />
        )}
        {panel?.kind === "gacha" && localPlayer && <GachaModal coins={localPlayer.coins} result={gachaResult} onPull={pullGacha} onClose={closePanel} />}
        {panel?.kind === "claw" && localPlayer && <ClawModal coins={localPlayer.coins} result={clawResult} onPlay={clawPlay} onClose={closePanel} />}
        {panel?.kind === "arcade" && <RetroGameModal result={arcadeResult} onScore={arcadeScore} onClose={closePanel} />}
        {panel?.kind === "well" && localPlayer && <WishModal coins={localPlayer.coins} result={wishResult} onWish={makeWish} onClose={closePanel} />}
        {panel?.kind === "teahouse" && <MatchaModal result={matchaResult} onWhisk={matchaWhisk} onClose={closePanel} />}
        {panel?.kind === "blender" && <BlenderModal result={blendResult} onBlend={blendDrink} onClose={closePanel} />}
        {panel?.kind === "jukebox" && <JukeboxModal playing={record} onPick={(t) => (setRecord(t), setPanel(null))} onClose={closePanel} />}
        {panel?.kind === "boardgame" && localSessionId && <BoardGameModal view={boardView} localSessionId={localSessionId} send={boardSend} onClose={closePanel} />}
        {panel?.kind === "kitchen" && <KitchenModal send={kitchenSend} onClose={closePanel} />}
        {panel?.kind === "radio" && <RadioModal radio={radio} send={radioSend} onClose={closePanel} />}
        {panel?.kind === "roast" && localSessionId && <RoastingModal send={campfireSend} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onClose={closePanel} />}
        {panel?.kind === "stargaze" && localSessionId && <StargazingModal send={campfireSend} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onClose={closePanel} />}
        {panel?.kind === "woodchop" && localSessionId && <WoodChopModal send={campfireSend} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onClose={closePanel} />}

        {panel?.kind === "mochi" && <MochiPlayroomModal result={mochiResult} onPlay={mochiPlay} onClose={closePanel} />}

        {wardrobeOpen && localPlayer && (
          <Wardrobe
            userId={localPlayer.userId}
            username={localPlayer.username}
            initial={parseLook(localPlayer.look) ?? defaultLook(localPlayer.userId || localPlayer.username, localPlayer.color)}
            coins={localPlayer.coins}
            owned={localPlayer.owned}
            onBuy={(hat: PremiumHat) => buyHat(hat)}
            onBuyOutfit={(outfit: OutfitId) => buyOutfit(outfit)}
            onBuyHair={(style: HairStyle) => buyHair(style)}
            onApply={setLook}
            onClose={closeWardrobe}
          />
        )}
      </div>
      <LoadingScreen stage="assets" />
    </>
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
        fontFamily: "var(--font-cozy)",
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
const roulettePanelStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "calc(max(18px, env(safe-area-inset-bottom)) + 64px)",
  transform: "translateX(-50%)",
  zIndex: 14,
};
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
