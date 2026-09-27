import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Header, MAP_LABELS } from "./components/hud/Header";
import { WorldDrawer } from "./components/hud/WorldDrawer";
import { SideDrawer } from "./components/hud/SideDrawer";
import { SettingsPanel } from "./components/hud/SettingsPanel";
import { SlotsModal } from "./components/hud/SlotsModal";
import { CashierModal } from "./components/hud/CashierModal";
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
import { WardrobeModal } from "./components/hud/WardrobeModal";
import { PatchNotesModal } from "./components/hud/PatchNotesModal";
import { FieldGuideModal } from "./components/hud/FieldGuideModal";
import { WorldTransitionScreen } from "./components/WorldTransitionScreen";
import { CHLOE_WELCOME } from "./entities/ChloeMaid";
import { setMarketRaw } from "./scene/marketStore";
import type { PioneerInfo } from "@shared/items";
import { loadSavedLook } from "./components/hud/lookStorage";
import { FishingModal, type FishReveal } from "./components/hud/FishingModal";
import { SlingshotModal } from "./components/hud/SlingshotModal";
import { BrambleModal } from "./components/hud/BrambleModal";
import { BackpackModal } from "./components/hud/BackpackModal";
import { PermitsModal, SplitBlockModal } from "./components/hud/SplitBlockModal";
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
import { FORAGE_INFO, ITEMS, TREASURE_COINS, guildRoomKey, type FishCaught, type ForageResult, type RoastResult, type StarlightReel } from "@shared/types";
import { LobbyModal } from "./components/LobbyModal";
import { rememberLounge, rejoinLounge } from "./systems/lounge";
import { rejoined, useUpdateWatch } from "./systems/lifecycle";
import { type BaccaratState, type BaccaratTable, type BigSixState, type BlackjackTableView, type CrapsView, type DerbyState } from "@shared/casino";
import type { PusherId } from "@shared/worlds/casino";
import type { HoldemView } from "@shared/holdem";
import { BLACKJACK_TABLES, CASINO_PROPS, PIANO_REACH, nearGameTable, seatedGameOf, ROULETTE_BET_RADIUS, ROULETTE_CENTER, type CasinoGameTable } from "@shared/worlds/casino";
import { BaccaratModal } from "./components/hud/BaccaratModal";
import type { PoolMatch } from "@shared/pool";
import { VipPassModal } from "./components/hud/VipPassModal";
import { PokerModal } from "./components/hud/PokerModal";
import { BigSixModal } from "./components/hud/BigSixModal";
import { CrapsModal } from "./components/hud/CrapsModal";
import { DerbyModal } from "./components/hud/DerbyModal";
import { CoinPusherModal } from "./components/hud/CoinPusherModal";
import { PinballModal } from "./components/hud/PinballModal";
import { PoolModal } from "./components/hud/PoolModal";
import { PianoModal } from "./components/hud/PianoModal";
import { FISH, RODS, TIER_COLOR, TIER_LABEL, fishKg, isKingSize, stars } from "@shared/fishing";
import { COZY_AURA_FUEL, LOW_FUEL, stewName, type BonfireUpdate, type StewUpdate } from "@shared/bonfire";
import { CookingModal } from "./components/hud/CookingModal";
import { BarnabyModal } from "./components/hud/BarnabyModal";
import { LumberjackModal } from "./components/hud/LumberjackModal";
import { WoodCraftModal } from "./components/hud/WoodCraftModal";
import { WoodCarrierModal } from "./components/hud/WoodCarrierModal";
import { CampfireStatus } from "./components/hud/CampfireStatus";
import { useAnglerProfile } from "./components/hud/anglerStore";
import { BoxingHud } from "./components/hud/BoxingHud";
import { installKeyboard } from "./systems/input";
import {
  ACHIEVEMENTS,
  EMOTES,
  isCasinoMap,
  type MapId,
  defaultLook,
  parseLook,
  parseStats,
  type BoardGameView,
  type FishOnLine,
  type GachaPrize,
  type MochiAction,
  type HairStyle,
  type OutfitId,
  type PremiumHat,
} from "@shared/types";
import { RoulettePanel } from "./components/hud/RoulettePanel";
import { BarMenuModal } from "./components/hud/BarMenuModal";
import { CapsuleModal } from "./components/hud/CapsuleModal";
import { FortuneModal } from "./components/hud/FortuneModal";
import { GazetteModal, recordCasinoNews } from "./components/hud/GazetteModal";
import { BAR_SNACK, CASINO_DRINKS, CHIP_EMOTE, OCCUPIED_LINE, type CasinoNotice, type CasinoPropEvent, type CasinoWin, type FortuneResult } from "@shared/casino";

/** The casino's panel games, and the table each one is played at (the panel closes when you walk
 *  away from it): by the panel's prop (the two poker tables share a panel). */
const GAME_PANELS: Record<string, CasinoGameTable> = { poker_table: "poker", vip_poker_table: "poker_vip", baccarat_table: "baccarat", hall_baccarat_table: "baccarat_hall", craps_table: "craps", derby_table: "derby", coin_pusher: "pusher", coin_pusher_high: "pusher_high", billiards_table: "billiards", big_six: "bigsix", pinball_01: "pinball", pinball_02: "pinball" };
const PIANO_AT = CASINO_PROPS.find((p) => p.propId === "piano_keys")!;
/** Why the house said no, for a toast. */
const NOTICE_TEXT: Record<CasinoNotice["reason"], string> = {
  chips: "Not enough Velvet Chips: Mr. Vance's cage is by the doors",
  far: "Step a little closer",
  limits: "That stake is off this table's limits",
  busy: "Not just now: finish what's on the table first",
  seat: "Take a seat at the table to play",
  occupied: OCCUPIED_LINE,
  pass: "Members only: a Black Velvet VIP Pass opens these doors",
};
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
@media (max-width: 767px) {
  .cozy-roulette .cozy-hint { display: none; }
}
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
/* On phones the bottom stack spans the width, centred (touch moves by tapping the floor). */
@media (max-width: 560px) {
  .cozy-bottom-stack { left: 12px; right: 12px; transform: none; align-items: center; max-width: none; }
}
.cozy-menu { animation: cozy-menu-in 160ms ease-out; }
@keyframes cozy-menu-in { from { opacity: 0; transform: translateY(-6px) scale(0.97); } }
.cozy-status { transform: translate(-50%, -50%); background: rgba(40, 30, 22, 0.62); color: #fff6e6; font: 700 11px system-ui, sans-serif; padding: 3px 8px; border-radius: 999px; white-space: nowrap; pointer-events: none; user-select: none; }
.cozy-zzz { position: absolute; left: 10px; bottom: 8px; font: 800 13px system-ui, sans-serif; color: #dfe8ff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); animation: cozy-zzz 2.4s ease-out infinite; pointer-events: none; }
.cozy-zzz:nth-child(2) { animation-delay: 0.8s; }
.cozy-zzz:nth-child(3) { animation-delay: 1.6s; }
@keyframes cozy-zzz { 0% { opacity: 0; transform: translate(0, 0) scale(0.6); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(14px, -34px) scale(1.2); } }
@media (max-width: 768px) { .cozy-hud-label { display: none; } }
/* The Velvet Pioneer's title over the name: glowing gold, breathing slowly. */
.cozy-title-gold {
  display: inline-block; white-space: nowrap; font: 800 10px var(--font-cozy); letter-spacing: 0.06em; line-height: 1.2;
  background: linear-gradient(180deg, #fff6c8 0%, #ffd76a 45%, #d9a22a 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 4px rgba(255, 200, 80, 0.85)) drop-shadow(0 1px 0 rgba(60, 30, 5, 0.9));
  animation: cozy-title-glow 2.6s ease-in-out infinite; pointer-events: none; user-select: none;
}
.cozy-title-gold .cozy-title-emoji { background: none; -webkit-text-fill-color: initial; color: initial; }
@keyframes cozy-title-glow { 0%, 100% { filter: drop-shadow(0 0 3px rgba(255, 200, 80, 0.6)) drop-shadow(0 1px 0 rgba(60, 30, 5, 0.9)); } 50% { filter: drop-shadow(0 0 9px rgba(255, 215, 110, 1)) drop-shadow(0 1px 0 rgba(60, 30, 5, 0.9)); } }
`;

export default function App() {
  const { auth, loading: authLoading, error: authError, retry: retryAuth } = useDiscordAuth();
  // the lounge picked on the selector (a soft restart remounts the game straight back into it: the
  // Discord session is still in memory, so the lounge is known from the first render)
  const guildKey = auth ? guildRoomKey(auth.guildId, auth.channelId) : "";
  const [lounge, setLounge] = useState<number | null>(() => (auth ? rejoinLounge(guildRoomKey(auth.guildId, auth.channelId)) : null));
  const pickLounge = useCallback(
    (n: number) => {
      rememberLounge(guildKey, n);
      setLounge(n);
    },
    [guildKey]
  );
  const {
    room,
    players,
    allPlayers,
    chairs,
    toggleables,
    localSessionId,
    currentMap,
    timeOfDay,
    weather,
    mapTransitioning,
    travellingTo,
    market,
    forest,
    claimPioneer,
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
    hearth,
    latency,
    claimAllowance,
    spinSlots,
    blackjackAction,
    machines,
    sendChat,
    sendGesture,
    buyHat,
    placeBet,
    clearBets,
    buyChips,
    cashOut,
    casinoSend,
    subscribeMessages,
    changeMap,
    setTimeOfDay,
    setWeather,
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
  } = useColyseusRoom(auth, lounge);

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
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  // opened by Chloe at her boutique: she greets you in it
  const [wardrobeGreeting, setWardrobeGreeting] = useState<string | undefined>(undefined);
  const [fieldGuideOpen, setFieldGuideOpen] = useState(false);
  const [pioneer, setPioneer] = useState<PioneerInfo | null>(null);
  const [slotsProp, setSlotsProp] = useState<string | null>(null);
  // the blackjack table whose panel is open, and every table's round as the room tells it
  const [blackjackOpen, setBlackjackOpen] = useState<string | null>(null);
  const [blackjackViews, setBlackjackViews] = useState<Record<string, BlackjackTableView>>({});
  // each baccarat table's coup (the hall's and the penthouse's), the Big Six's spin
  const [baccarat, setBaccarat] = useState<Partial<Record<BaccaratTable, BaccaratState>>>({});
  const [bigSix, setBigSix] = useState<BigSixState | null>(null);
  const [poolMatch, setPoolMatch] = useState<PoolMatch | null>(null);
  // the casino's panel games: the server's latest word on each
  const [holdemView, setHoldemView] = useState<HoldemView | null>(null);
  const [crapsView, setCrapsView] = useState<CrapsView | null>(null);
  const [derbyState, setDerbyState] = useState<DerbyState | null>(null);
  const closeWardrobe = useCallback(() => {
    setWardrobeOpen(false);
    setWardrobeGreeting(undefined);
  }, []);

  // --- titan infinity panels: whichever prop you walked up to (openPanel), and its results ---
  const [panel, setPanel] = useState<{ kind: string; propId: string } | null>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const [fishOnLine, setFishOnLine] = useState<FishOnLine | null>(null);
  const closeFishing = useCallback(() => setFishOnLine(null), []);
  // the campfire's reel: a fish on the line at the dock
  const [starReel, setStarReel] = useState<StarlightReel | null>(null);
  const [reelReveal, setReelReveal] = useState<FishReveal | null>(null);
  const [reelEscaped, setReelEscaped] = useState(false);
  const [reelNo, setReelNo] = useState(0);
  const starReelRef = useRef(false);
  starReelRef.current = !!starReel;
  const closeStarReel = useCallback(() => {
    setStarReel(null);
    setReelReveal(null);
  }, []);
  const [gachaResult, setGachaResult] = useState<GachaPrize | null>(null);
  const [clawResult, setClawResult] = useState<{ won: boolean; target: number } | null>(null);
  const [arcadeResult, setArcadeResult] = useState<{ coins: number } | null>(null);
  const [wishResult, setWishResult] = useState<{ fortune: string; lucky: number } | null>(null);
  const [matchaResult, setMatchaResult] = useState<{ coins: number } | null>(null);
  const [blendResult, setBlendResult] = useState<{ right: boolean; coins: number } | null>(null);
  const [boardView, setBoardView] = useState<BoardGameView | null>(null);
  const [mochiResult, setMochiResult] = useState<{ action: MochiAction; coins: number; cooldown: boolean } | null>(null);
  // the casino's tables open only when asked (the dock, or a click on the table): never by walking past
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [fortune, setFortune] = useState<FortuneResult | null>(null);
  // B opens (and closes) the backpack, whenever nothing is being typed and no other panel is up
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyB" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      setPanel((p) => (p?.kind === "backpack" ? null : p ? p : { kind: "backpack", propId: "backpack" }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const openPanel = useCallback((kind: string, propId: string) => {
    // a fresh panel starts with no stale result from last time
    setGachaResult(null);
    setClawResult(null);
    setArcadeResult(null);
    setWishResult(null);
    setMatchaResult(null);
    setBlendResult(null);
    setMochiResult(null);
    // the casino's exit doors: the world drawer, to go home or anywhere else
    if (kind === "worlds") {
      setWorldsOpen(true);
      return;
    }
    // Chloe at the Velvet Boutique: the wardrobe, with her welcome
    if (kind === "boutique") {
      setWardrobeGreeting(CHLOE_WELCOME);
      setWardrobeOpen(true);
      return;
    }
    // the casino's tables: their own boards, not a panel
    if (kind === "roulette") {
      setRouletteOpen(true);
      return;
    }
    if (kind === "blackjack") {
      setBlackjackOpen(propId);
      return;
    }
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
  // the world's soundscape (the lounge's folk-jazz trio, resting while its radio plays; the
  // campfire's; the casino's band), cross-faded in half a second as you travel
  const radioOn = Object.values(toggleables).some((t) => t.kind === "radio" && t.on);
  useWorldAmbience(currentMap, hearth.fuel, radioOn, weather === "rain");
  // the camp's market, for the chalkboard by Barnaby's stall
  useEffect(() => setMarketRaw(market), [market]);
  // where the chat came from, for a line said in another world
  const allPlayersRef = useRef(allPlayers);
  allPlayersRef.current = allPlayers;
  const currentMapRef = useRef<MapId>(currentMap);
  currentMapRef.current = currentMap;
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
          pushToast(`${best.username} won ${best.amount} chips${winners.length > 1 ? ` (+${winners.length - 1} more)` : ""}`, { emoji: "🎉", tone: "win", silent: true });
        } else if (type === "openSlots") {
          setSlotsProp((payload as { propId: string }).propId);
        } else if (type === "fortuneResult") {
          setFortune(payload as FortuneResult);
        } else if (type === "casinoWin") {
          const w = payload as CasinoWin;
          recordCasinoNews(w);
          if (w.celebrate) pushToast(`${w.username} hit ${w.detail} for ${w.amount} chips!`, { emoji: "🎉", tone: "win" });
        } else if (type === "casinoNotice") {
          // the bar and the capsule machine say so in their own panels
          if (panelKindRef.current !== "barmenu" && panelKindRef.current !== "capsule") pushToast(NOTICE_TEXT[(payload as CasinoNotice).reason] ?? NOTICE_TEXT.far, { emoji: CHIP_EMOTE });
        } else if (type === "casinoProp") {
          const ev = payload as CasinoPropEvent;
          if (ev.sessionId !== localIdRef.current) return;
          if (ev.kind === "tipjar") pushToast(`${ev.dealer === "boris" ? "Boris" : "Madame Vivienne"} thanks you for the tip`, { emoji: "🪙" });
          else if (ev.kind === "barmenu" && ev.drink && panelKindRef.current !== "barmenu") pushToast(`Pippin serves you a ${CASINO_DRINKS[ev.drink].name}`, { emoji: CASINO_DRINKS[ev.drink].emoji });
          else if (ev.kind === "barmenu" && ev.snack) {
            playSfx("crunch");
            if (panelKindRef.current !== "barmenu") pushToast(`Pippin slides you a basket of ${BAR_SNACK.name}`, { emoji: BAR_SNACK.emoji });
          } else if (ev.kind === "vipdoor" && ev.vip === "in") pushToast("Bruno bows you into the elevator: welcome to the Velvet Penthouse", { emoji: "🥂", tone: "arrive" });
          else if (ev.kind === "vipdoor" && ev.vip === "out") pushToast("Back down on the High-Roller Stage", { emoji: "🛗", silent: true });
          else if (ev.kind === "vipdoor" && ev.vip === "refused") pushToast("Members only: a Black Velvet VIP Pass opens these doors", { emoji: "🕶️" });
          else if (ev.kind === "machine" && ev.excused) pushToast("The patron smiles and finishes up: the machine's yours in a moment", { emoji: "💬" });
        } else if (type === "blackjackTable") {
          const v = payload as BlackjackTableView;
          setBlackjackViews((prev) => ({ ...prev, [v.tableId]: v }));
        } else if (type === "baccaratState") {
          const b = payload as BaccaratState;
          setBaccarat((prev) => ({ ...prev, [b.table]: b }));
        } else if (type === "bigSixState") {
          setBigSix(payload as BigSixState);
        } else if (type === "poolState") {
          setPoolMatch(payload as PoolMatch);
        } else if (type === "holdemState") {
          setHoldemView(payload as HoldemView);
        } else if (type === "crapsState") {
          setCrapsView(payload as CrapsView);
        } else if (type === "derbyState") {
          setDerbyState(payload as DerbyState);
        } else if (type === "allowance") {
          const a = payload as { ok: boolean; coins?: number; retryInS?: number };
          if (a.ok) pushToast(`The house tops you up: +${a.coins} coins`, { emoji: "🎁", tone: "coin" });
          else pushToast(`Allowance again in ${Math.ceil((a.retryInS ?? 0) / 60)} min`, { emoji: "⏳" });
        } else if (type === "pioneer") {
          const info = payload as PioneerInfo & { justClaimed?: boolean };
          setPioneer({ eligible: info.eligible, claimed: info.claimed, until: info.until });
          if (info.justClaimed) {
            playSfx("jackpot");
            pushToast("The Velvet Pioneer set is yours: thank you for playing the beta!", { emoji: "🛠️", tone: "win" });
          } else if (info.eligible && !info.claimed) pushToast("Beta player? The Velvet Pioneer set is yours to claim, free, at Chloe's Velvet Boutique in the lounge", { emoji: "🛠️", tone: "arrive" });
        } else if (type === "chatBubble") {
          // chat reaches every world: a line from someone elsewhere shows as a toast, with where
          const c = payload as { sessionId: string; text: string; map?: MapId; username?: string };
          if (c.sessionId !== localIdRef.current && c.map && c.map !== currentMapRef.current) {
            const where = MAP_LABELS[c.map];
            pushToast(`${where?.icon ?? "💬"} ${c.username ?? allPlayersRef.current[c.sessionId]?.username ?? "Someone"}: ${c.text}`, { emoji: "💬", silent: true });
          }
        } else if (type === "welcome") {
          const w = payload as { isNew: boolean; coins: number };
          pushToast(w.isNew ? `Welcome to CozyCube! Here are ${w.coins} coins to start` : `Welcome back! Your ${w.coins} coins are right where you left them`, { emoji: w.isNew ? "🎀" : "👋", tone: "arrive" });
        } else if (type === "openPanel") {
          const p = payload as { kind: string; propId: string };
          openPanel(p.kind, p.propId);
        } else if (type === "fishOnLine") {
          setFishOnLine(payload as FishOnLine);
        } else if (type === "fishEscaped") {
          setReelEscaped(true);
        } else if (type === "starlightReel") {
          setStarReel(payload as StarlightReel);
          setReelReveal(null);
          setReelEscaped(false);
          setReelNo((n) => n + 1);
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
          // the campfire's river: into the creel (or, the creel full, back in the river for a few coins)
          const c = payload as FishCaught;
          if (c.sessionId === localIdRef.current) {
            const info = FISH[c.fish.s];
            const released = c.coins - c.treasure;
            // a reel still open: the fish is revealed there (its model turning, its weight)
            const revealed = !c.afk && starReelRef.current;
            if (revealed)
              setReelReveal({ species: c.fish.s, name: info.name, emoji: info.emoji, tier: TIER_LABEL[info.tier], tierColor: TIER_COLOR[info.tier], cm: c.fish.cm, kg: fishKg(c.fish), stars: stars(c.fish.q), record: c.record, king: isKingSize(c.fish), released: c.released });
            if (c.released) pushToast(released > 0 ? `Livewell full! Released for +${released} coins` : "Livewell full! Released back to the water", { emoji: "🪣", tone: released > 0 ? "coin" : undefined });
            else if (!revealed) pushToast(`${c.afk ? "💤 " : ""}${info.name} · ${c.fish.cm} cm ${stars(c.fish.q)}${isKingSize(c.fish) ? " · King Size 👑" : ""}${c.record ? " · New personal best!" : ""}`, { emoji: c.record ? "🏆" : info.emoji, silent: c.afk && !c.record, tone: c.record ? "win" : undefined });
            // a new personal best: the catch held high, and a chime
            if (c.record) playSfx("trophy");
            if (c.treasure > 0) pushToast(`Sunken treasure! +${c.treasure} coins`, { emoji: "🧰", tone: "coin" });
            playSfx("catch");
          }
        } else if (type === "creelFull") {
          const f = payload as { capacity?: number };
          pushToast(`Creel full (${f.capacity ?? 0}/${f.capacity ?? 0})! Rod stowed: sell some fish to Barnaby`, { emoji: "🪣", silent: true });
        } else if (type === "BONFIRE_STATE_UPDATE") {
          // wood on the fire: a whoosh for everyone; the fire crossing into the Cozy Aura, or sinking low
          const u = payload as BonfireUpdate;
          const before = u.fuel - u.amount;
          if (u.amount > 0) playSfx("flame");
          if (u.sessionId === localIdRef.current) pushToast(`The fire roars up! ${u.fuel}%`, { emoji: u.item === "charcoal" ? "✨" : "🪵", silent: true });
          if (before <= COZY_AURA_FUEL && u.fuel > COZY_AURA_FUEL) pushToast("Cozy Aura! +15% rare fish and campfire coins", { emoji: "✨", tone: "win" });
          else if (before > COZY_AURA_FUEL && u.fuel <= COZY_AURA_FUEL) pushToast("The Cozy Aura fades as the fire settles", { emoji: "🔥", silent: true });
          else if (before >= LOW_FUEL && u.fuel < LOW_FUEL && u.fuel > 0) pushToast("The fire's burning low. Chop some firewood!", { emoji: "🪵" });
          if (before > 0 && u.fuel <= 0) pushToast("The bonfire has gone out. Relight it with a log!", { emoji: "🌑" });
          else if (before <= 0 && u.fuel > 0) pushToast("The bonfire crackles back to life!", { emoji: "🔥", tone: "win" });
        } else if (type === "STEW_STATE_UPDATE") {
          const u = payload as StewUpdate;
          if (u.event === "add") playSfx("bubble");
          if (u.event === "scoop" && u.sessionId === localIdRef.current) {
            playSfx("slurp");
            pushToast("A warm bowl of stew: Well-Fed for 8 minutes", { emoji: "🥣", tone: "win" });
          }
          if (u.event === "cold") pushToast(`The ${stewName(u.stew.items.length ? u.stew.items : [])} went cold and was tipped out`, { emoji: "🫕", silent: true });
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
  const seenOn = useRef<MapId | null>(null);
  useEffect(() => {
    const ids = new Set(Object.keys(players));
    // arriving in a world yourself, everyone already there is not news
    if (seenOn.current !== currentMap) seenPlayers.current = null;
    seenOn.current = currentMap;
    if (seenPlayers.current) {
      for (const id of ids) {
        if (!seenPlayers.current.has(id) && id !== localSessionId) pushToast(`${players[id].username} arrived`, { emoji: "🚪", tone: "arrive", silent: true });
      }
    }
    seenPlayers.current = ids;
  }, [players, localSessionId, currentMap]);

  // --- table proximity: the roulette board and the blackjack panel follow you to the tables ---
  const atRoulette = currentMap === "velvet_casino" && !!me && !me.sitting && Math.hypot(me.x - ROULETTE_CENTER.x, me.z - ROULETTE_CENTER.z) < ROULETTE_BET_RADIUS;
  // the seat you are on (the seated games' panels follow it)
  const mySeat = useMemo(() => (localSessionId ? (Object.values(chairs).find((c) => c.occupiedBy === localSessionId)?.propId ?? "") : ""), [chairs, localSessionId]);
  const openTable = blackjackOpen ? BLACKJACK_TABLES.find((t) => t.id === blackjackOpen) : undefined;
  // a blackjack panel stays open on one of its stools, or standing by the table to look on
  const atBlackjack = currentMap === "velvet_casino" && !!me && !!openTable && (openTable.stools.includes(mySeat) || Math.hypot(me.x - openTable.x, me.z - openTable.z) < openTable.reach + 0.8);
  // the betting board closes when you walk away from the table (it opens only when asked)
  useEffect(() => {
    if (!atRoulette) setRouletteOpen(false);
  }, [atRoulette]);
  useEffect(() => {
    const open = () => setRouletteOpen(true);
    window.addEventListener("cozy-open-roulette", open);
    return () => window.removeEventListener("cozy-open-roulette", open);
  }, []);
  useEffect(() => {
    if (!atBlackjack) setBlackjackOpen(null);
  }, [atBlackjack]);
  useEffect(() => {
    if (!isCasinoMap(currentMap)) {
      setSlotsProp(null);
      setBlackjackOpen(null);
      setBlackjackViews({});
      setBaccarat({});
      setBigSix(null);
      setPoolMatch(null);
      setRouletteOpen(false);
      setFortune(null);
      setHoldemView(null);
      setCrapsView(null);
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
  const showRoulette = atRoulette && rouletteOpen && !blackjackOpen && !slotsProp;
  // the panel games close when you walk away from their tables (and the piano's when you leave it);
  // the ones played sitting down (poker) when you get up
  const panelKind = panel?.kind;
  const panelTable = panel ? GAME_PANELS[panel.propId] : undefined;
  const seatedOnly = panel && panelKind === "poker" ? seatedGameOf(panel.propId) : undefined;
  const awayFromPanel =
    isCasinoMap(currentMap) &&
    !!me &&
    !!panelKind &&
    ((panelTable !== undefined && !nearGameTable(panelTable, me.x, me.z, 0.5)) || (!!seatedOnly && !seatedOnly.seats.includes(mySeat)) || (panelKind === "piano" && (mySeat !== "seat_piano" || Math.hypot(me.x - PIANO_AT.x, me.z - PIANO_AT.z) > PIANO_REACH + 0.5)));
  useEffect(() => {
    if (awayFromPanel) setPanel(null);
  }, [awayFromPanel]);
  // sitting down at the baby grand asks what to play
  const onPianoBench = currentMap === "velvet_casino" && !!localSessionId && chairs.seat_piano?.occupiedBy === localSessionId;
  useEffect(() => {
    if (onPianoBench) openPanel("piano", "piano_keys");
  }, [onPianoBench, openPanel]);

  // the angler's creel, rods and baits (the room's copy, or the one mirrored locally until it syncs)
  const angler = useAnglerProfile(me?.userId ?? "", me?.fishing ?? "", me?.coins ?? 0);
  const playerCount = useMemo(() => Object.values(players).filter((p) => p.connected).length, [players]);
  // who is in each world (the fast-travel cards)
  const mapCounts = useMemo(() => {
    const counts: Partial<Record<MapId, number>> = {};
    for (const p of Object.values(allPlayers)) if (p.connected) counts[p.map] = (counts[p.map] ?? 0) + 1;
    return counts;
  }, [allPlayers]);

  // the version handshake and a deploy's restart (systems/lifecycle.ts): a soft restart in memory,
  // or the ask to start the Activity afresh when new code is live; never a reload of the frame
  useUpdateWatch(subscribeMessages);
  // back in the room after a soft restart: the "Updating" curtain lifts
  useEffect(() => {
    if (connected) rejoined();
  }, [connected]);
  // Settings' "Switch lounge": the selector over the game, this lounge still yours (and counted)
  // until another is picked; then the room hook leaves this one (consented: the seat is let go and
  // the account saved at once) and joins the new one, all in memory
  const [switching, setSwitching] = useState(false);
  const switchLounge = useCallback(() => {
    setSettingsOpen(false);
    setSwitching(true);
  }, []);

  // The cozy loading screen covers the Discord handshake, the room join and the models loading.
  // It is the second child of the same fragment on every path below, so React keeps it as one
  // element from the first frame until it fades out over the lounge. A join that fails or a
  // connection that drops stays on the room stage while useColyseusRoom retries; after a while the
  // screen says so and offers Reconnect (it never waits silently forever).
  const loadStage: LoadStage = authLoading ? "discord" : authError ? "error" : lounge === null ? "lobby" : !connected ? "room" : "assets";
  const loadError = authError ? `Couldn't reach Discord: ${authError}` : undefined;
  if (loadStage !== "assets")
    return (
      <>
        {null}
        <LoadingScreen stage={loadStage} error={loadError} issue={connectionIssue ?? undefined} onReconnect={reconnect} onRetry={retryAuth} />
        {loadStage === "lobby" && auth && <LobbyModal auth={auth} guildKey={guildKey} onPick={pickLounge} />}
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
            weather={weather}
            speakingUserIds={voice.speakingUserIds}
            subscribeEmotes={subscribeEmotes}
            subscribeMessages={subscribeMessages}
            hearth={hearth}
            forest={forest}
          />
        </IsometricCanvas>

        <Header
          currentMap={currentMap}
          playerCount={playerCount}
          onOpenWorlds={() => setWorldsOpen(true)}
          timeOfDay={timeOfDay}
          onSelectTime={setTimeOfDay}
          weather={weather}
          onSelectWeather={setWeather}
          autoCycle={autoCycle}
          onToggleAutoCycle={() => setAutoCycle(!autoCycle)}
          coins={localPlayer?.coins ?? 0}
          chips={localPlayer?.chips ?? 0}
          onClaimAllowance={claimAllowance}
          status={localPlayer?.status ?? ""}
          onSetStatus={setStatus}
          onOpenLeaderboard={() => setLeaderboardOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSocial={() => setSocialOpen((o) => !o)}
          socialOpen={socialOpen}
          userId={localPlayer?.userId ?? ""}
          fishing={localPlayer?.fishing ?? ""}
          bag={localPlayer?.bag ?? ""}
          market={market}
          onOpenFieldGuide={() => setFieldGuideOpen(true)}
          connected={connected}
          reconnecting={reconnecting}
          latency={latency}
        />
        <Toasts />
        <ReconnectingPill active={reconnecting} place={MAP_LABELS[currentMap]?.name ?? "the lounge"} onRetry={retryNow} />

        {localPlayer && localSessionId && (
          <div className="cozy-bottom-stack">
            <ActivityBar
              subscribeMessages={subscribeMessages}
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
            <ActionDock player={localPlayer} players={players} mapId={currentMap} chairs={chairs} toggleables={toggleables} localSessionId={localSessionId} hearth={hearth} machines={machines} onWater={(plantId) => plantSend({ type: "PLANT_WATER", plantId })} onCampfire={campfireSend} onCasino={casinoSend} />
          </div>
        )}

        {currentMap === "campfire_night" && localPlayer && !mapTransitioning && <CampfireStatus hearth={hearth} fed={localPlayer.fed} />}

        {showRoulette && localPlayer && localSessionId && (
          <RoulettePanel
            roulette={roulette}
            myBets={bets[localSessionId] ?? ""}
            chips={localPlayer.chips}
            localSessionId={localSessionId}
            onPlaceBet={placeBet}
            onClearBets={clearBets}
            subscribeMessages={subscribeMessages}
            onClose={() => setRouletteOpen(false)}
          />
        )}

        <WorldTransitionScreen destination={travellingTo} from={currentMap} />

        {worldsOpen && <WorldDrawer currentMap={currentMap} counts={mapCounts} disabled={mapTransitioning} onSelect={changeMap} onClose={() => setWorldsOpen(false)} />}
        {socialOpen && (
          <SideDrawer
            players={allPlayers}
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
        {settingsOpen && (
          <SettingsPanel
            onClose={() => setSettingsOpen(false)}
            onSwitchLounge={switchLounge}
            onOpenPatchNotes={() => {
              setSettingsOpen(false);
              setPatchNotesOpen(true);
            }}
          />
        )}
        {patchNotesOpen && <PatchNotesModal onClose={() => setPatchNotesOpen(false)} />}
        {switching && auth && (
          <LobbyModal
            auth={auth}
            guildKey={guildKey}
            current={lounge}
            onPick={(n) => {
              setSwitching(false);
              if (n !== lounge) pickLounge(n);
            }}
            onCancel={() => setSwitching(false)}
          />
        )}
        {fieldGuideOpen && <FieldGuideModal profile={angler.profile} market={market} onClose={() => setFieldGuideOpen(false)} />}
        {leaderboardOpen && isCasinoMap(currentMap) && <LeaderboardModal leaderboard={leaderboard} players={players} localName={localPlayer?.username ?? ""} onClose={() => setLeaderboardOpen(false)} />}
        {slotsProp && localPlayer && localSessionId && (
          <SlotsModal propId={slotsProp} chips={localPlayer.chips} coins={localPlayer.coins} localSessionId={localSessionId} onSpin={spinSlots} subscribeMessages={subscribeMessages} onClose={() => setSlotsProp(null)} />
        )}
        {openTable && localPlayer && localSessionId && (
          <BlackjackModal
            view={blackjackViews[openTable.id] ?? null}
            table={openTable}
            stoolNames={Object.fromEntries(openTable.stools.map((s) => [s, players[chairs[s]?.occupiedBy ?? ""]?.username ?? ""]))}
            localSessionId={localSessionId}
            seated={openTable.stools.includes(mySeat)}
            chips={localPlayer.chips}
            coins={localPlayer.coins}
            onAction={blackjackAction}
            onTakeSeat={() => interactBridge.current?.useProp(openTable.id)}
            onClose={() => setBlackjackOpen(null)}
          />
        )}

        {/* the world's own panels */}
        {fishOnLine && (
          <FishingModal
            fish={{ emoji: fishOnLine.item === "boot" ? "🥾" : ITEMS[fishOnLine.item].emoji, name: fishOnLine.item === "boot" ? "old boot" : ITEMS[fishOnLine.item].name.toLowerCase(), speed: fishOnLine.speed, size: fishOnLine.size, hint: fishOnLine.water === "ocean" ? "Something from the sea" : "Something from the river" }}
            onResult={catchFish}
            onClose={closeFishing}
          />
        )}
        {starReel &&
          (() => {
            const rod = RODS[starReel.rod] ?? RODS.bamboo;
            return (
              <FishingModal
                key={`reel:${reelNo}`}
                fish={{
                  emoji: "🐟",
                  name: "fish",
                  speed: starReel.swim.speed,
                  size: starReel.swim.size,
                  pattern: starReel.swim.pattern,
                  barScale: Math.min(1.3, starReel.swim.barScale * (1 + rod.barBonus)),
                  tensionResist: rod.tensionResist,
                  hint: `${rod.emoji} ${rod.name}`,
                  treasure: starReel.treasure,
                  treasureReward: TREASURE_COINS,
                  shadow: starReel.shadow,
                }}
                reveal={reelReveal}
                escaped={reelEscaped}
                onResult={(result, _quality, openedChest) => campfireSend({ type: "REEL_DONE", caught: result === "caught", treasure: openedChest })}
                onClose={closeStarReel}
                autoCloseMs={2200}
              />
            );
          })()}
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
        {panel?.kind === "woodchop" && localSessionId && <WoodChopModal key={panel.propId} tree={panel.propId.startsWith("tree_") ? panel.propId : undefined} send={campfireSend} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onClose={closePanel} />}
        {panel?.kind === "splitblock" && <SplitBlockModal profile={angler.profile} send={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "slingshot" && <SlingshotModal send={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "bramble" && localPlayer && <BrambleModal profile={angler.profile} coins={localPlayer.coins} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "backpack" && <BackpackModal profile={angler.profile} onClose={closePanel} />}
        {panel?.kind === "permits" && localPlayer && (
          <PermitsModal
            profile={angler.profile}
            coins={localPlayer.coins}
            send={campfireSend}
            subscribeMessages={subscribeMessages}
            onEnter={() => {
              setPanel(null);
              interactBridge.current?.useProp("woods_gate");
            }}
            onClose={closePanel}
          />
        )}
        {panel?.kind === "cooking" && localPlayer && <CookingModal hearth={hearth} profile={angler.profile} bag={localPlayer.bag} userId={localPlayer.userId} fed={localPlayer.fed} send={campfireSend} onClose={closePanel} />}
        {panel?.kind === "carrier" && localPlayer && <WoodCarrierModal profile={angler.profile} bag={localPlayer.bag} send={campfireSend} onClose={closePanel} />}
        {panel?.kind === "workbench" && localPlayer && <WoodCraftModal profile={angler.profile} send={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "cashier" && localPlayer && <CashierModal coins={localPlayer.coins} chips={localPlayer.chips} onBuy={buyChips} onCashOut={cashOut} vipPass={localPlayer.vipPass} wristbands={localPlayer.vipWristbands} send={casinoSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "vippass" && localPlayer && (
          <VipPassModal
            hasPass={localPlayer.vipPass}
            wristbands={localPlayer.vipWristbands}
            coins={localPlayer.coins}
            send={casinoSend}
            subscribeMessages={subscribeMessages}
            onGoUp={() => {
              setPanel(null);
              interactBridge.current?.useProp("vip_door");
            }}
            onClose={closePanel}
          />
        )}
        {panel?.kind === "baccarat" && localPlayer && localSessionId && (() => {
          const table: BaccaratTable = panel.propId === "hall_baccarat_table" ? "baccarat_hall" : "baccarat";
          const game = seatedGameOf(panel.propId);
          return (
            <BaccaratModal
              table={table}
              state={baccarat[table] ?? null}
              localSessionId={localSessionId}
              seated={!!game?.seats.includes(mySeat)}
              seatFree={!!game?.seats.some((s) => !chairs[s]?.occupiedBy)}
              chips={localPlayer.chips}
              coins={localPlayer.coins}
              onBet={(bet, amount) => casinoSend({ type: "BACCARAT_BET", bet, amount })}
              onTakeSeat={() => interactBridge.current?.useProp(panel.propId)}
              onClose={closePanel}
            />
          );
        })()}
        {panel?.kind === "bigsix" && localPlayer && localSessionId && <BigSixModal state={bigSix} localSessionId={localSessionId} chips={localPlayer.chips} coins={localPlayer.coins} onBet={(bet, amount) => casinoSend({ type: "BIGSIX_BET", bet, amount })} onClose={closePanel} />}
        {panel?.kind === "barmenu" && localPlayer && localSessionId && <BarMenuModal chips={localPlayer.chips} aura={localPlayer.aura} localSessionId={localSessionId} onOrder={casinoSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "capsule" && localPlayer && <CapsuleModal chips={localPlayer.chips} owned={localPlayer.owned} title={localPlayer.title} onSend={casinoSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "gazette" && <GazetteModal leaderboard={leaderboard} onClose={closePanel} />}
        {panel?.kind === "poker" && localPlayer && <PokerModal view={holdemView} table={panel.propId === "vip_poker_table" ? "poker_vip" : "poker"} chips={localPlayer.chips} coins={localPlayer.coins} onDeal={(buyIn) => casinoSend({ type: "HOLDEM_DEAL", buyIn })} onMove={(move) => casinoSend({ type: "HOLDEM_MOVE", move })} onClose={closePanel} />}
        {panel?.kind === "craps" && localPlayer && <CrapsModal view={crapsView} chips={localPlayer.chips} coins={localPlayer.coins} onRoll={(stakes) => casinoSend({ type: "CRAPS_ROLL", stakes })} onClose={closePanel} />}
        {panel?.kind === "derby" && localPlayer && localSessionId && <DerbyModal state={derbyState} chips={localPlayer.chips} coins={localPlayer.coins} localSessionId={localSessionId} onBet={(horse, amount) => casinoSend({ type: "DERBY_BET", horse, amount })} onClose={closePanel} />}
        {panel?.kind === "pusher" && localPlayer && (
          <CoinPusherModal
            key={panel.propId}
            propId={panel.propId as PusherId}
            chips={localPlayer.chips}
            coins={localPlayer.coins}
            subscribeMessages={subscribeMessages}
            onDrop={(stake, pos) => casinoSend({ type: "PUSHER_DROP", propId: panel.propId as PusherId, stake, pos })}
            onClose={() => {
              casinoSend({ type: "PUSHER_CLOSE" });
              closePanel();
            }}
          />
        )}
        {panel?.kind === "pinball" && <PinballModal key={panel.propId} propId={panel.propId} chips={localPlayer?.chips ?? 0} subscribeMessages={subscribeMessages} send={casinoSend} onClose={closePanel} />}
        {panel?.kind === "pool" && localSessionId && <PoolModal match={poolMatch} localSessionId={localSessionId} send={casinoSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "piano" && localSessionId && <PianoModal localSessionId={localSessionId} send={casinoSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {fortune && <FortuneModal fortune={fortune} onClose={() => setFortune(null)} />}
        {panel?.kind === "buster" && localPlayer && <LumberjackModal profile={angler.profile} coins={localPlayer.coins} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "barnaby" && localPlayer && <BarnabyModal profile={angler.profile} coins={localPlayer.coins} fuel={hearth.fuel} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onOpenFieldGuide={() => setFieldGuideOpen(true)} onClose={closePanel} />}

        {panel?.kind === "mochi" && <MochiPlayroomModal result={mochiResult} onPlay={mochiPlay} onClose={closePanel} />}

        {wardrobeOpen && localPlayer && (
          <WardrobeModal
            userId={localPlayer.userId}
            username={localPlayer.username}
            initial={parseLook(localPlayer.look) ?? defaultLook(localPlayer.userId || localPlayer.username, localPlayer.color)}
            coins={localPlayer.coins}
            owned={localPlayer.owned}
            title={localPlayer.title}
            pioneer={pioneer}
            greeting={wardrobeGreeting}
            onBuy={(hat: PremiumHat) => buyHat(hat)}
            onBuyOutfit={(outfit: OutfitId) => buyOutfit(outfit)}
            onBuyHair={(style: HairStyle) => buyHair(style)}
            onClaimPioneer={claimPioneer}
            onWearTitle={(id) => casinoSend({ type: "EQUIP_TITLE", id })}
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
