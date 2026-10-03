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
import { lampGlow, tensionCut } from "@shared/gear";
import { WorldTransitionScreen } from "./components/WorldTransitionScreen";
import { CHLOE_WELCOME } from "./entities/ChloeMaid";
import { setMarketRaw } from "./scene/marketStore";
import type { PioneerInfo } from "@shared/items";
import { loadSavedLook } from "./components/hud/lookStorage";
import { FishingModal, type FishReveal } from "./components/hud/FishingModal";
import { SlingshotModal } from "./components/hud/SlingshotModal";
import { BrambleModal } from "./components/hud/BrambleModal";
import { FishLivewellModal } from "./components/hud/FishLivewellModal";
import { LogbookModal } from "./components/hud/LogbookModal";
import { PermitsModal, SplitBlockModal } from "./components/hud/SplitBlockModal";
import { GachaModal } from "./components/hud/GachaModal";
import { ClawModal } from "./components/hud/ClawModal";
import { RetroGameModal } from "./components/hud/RetroGameModal";
import { WishModal } from "./components/hud/WishModal";
import { MatchaModal } from "./components/hud/MatchaModal";
import { JukeboxModal } from "./components/hud/JukeboxModal";
import { BoardGameModal } from "./components/hud/BoardGameModal";
import { KitchenModal } from "./components/hud/KitchenModal";
import { RadioModal } from "./components/hud/RadioModal";
import { useRadio } from "./hooks/useRadio";
import { RoastingModal } from "./components/hud/RoastingModal";
import { StargazingModal } from "./components/hud/StargazingModal";
import { FellingModal } from "./components/hud/FellingModal";
import { WonderBadge } from "./components/hud/WonderBadge";
import { lampBoost } from "./scene/caveGear";
import { BuffRow } from "./components/hud/BuffRow";
import { useWorldAmbience } from "./audio/ambience";
import { playSfx } from "./audio/sfx";
import { FORAGE_INFO, ITEMS, TREASURE_COINS, guildRoomKey, type FishCaught, type ForageResult, type RoastResult, type StarlightReel } from "@shared/types";
import { LobbyModal } from "./components/LobbyModal";
import { forgetLounge, rememberLounge, rejoinLounge } from "./systems/lounge";
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
import { DRINKS, type Drink, type DrinkServed } from "@shared/barshift";
import { PinballModal } from "./components/hud/PinballModal";
import { BeachBarModal } from "./components/hud/BeachBarModal";
import { BarShiftSheet } from "./components/hud/BarShiftSheet";
import { PoolModal } from "./components/hud/PoolModal";
import { PianoModal } from "./components/hud/PianoModal";
import { FISH, RODS, TIER_COLOR, TIER_LABEL, fishKg, gradeOf, isKingSize, stars } from "@shared/fishing";
import { COZY_AURA_FUEL, LOW_FUEL, stewName, type BonfireUpdate, type StewUpdate } from "@shared/bonfire";
import { CookingModal } from "./components/hud/CookingModal";
import { BarnabyModal } from "./components/hud/BarnabyModal";
import { LumberjackModal } from "./components/hud/LumberjackModal";
import { WoodCraftModal } from "./components/hud/WoodCraftModal";
import { WoodCarrierModal } from "./components/hud/WoodCarrierModal";
import { CampfireStatus } from "./components/hud/CampfireStatus";
import { useAnglerProfile } from "./components/hud/anglerStore";
import { BoxingHud } from "./components/hud/BoxingHud";
import { OreSatchelDrawer } from "./components/hud/OreSatchelDrawer";
import { GusShopModal } from "./components/hud/GusShopModal";
import { ForgeModal } from "./components/hud/ForgeModal";
import { GeodeModal } from "./components/hud/GeodeModal";
import { FlintModal } from "./components/hud/FlintModal";
import { ProspectingHud } from "./components/hud/ProspectingHud";
import { SoakHud } from "./components/hud/SoakHud";
import { CaveCodexHud } from "./components/hud/CaveCodexHud";
import { CaveCodexModal } from "./components/hud/CaveCodexModal";
import { CaveMapModal } from "./components/hud/CaveMapModal";
import { prospectStore } from "./systems/prospectStore";
import { CAVERNS_CHANNELS, ORE_ITEMS, type CaveLoot, type CaveProspect, type CavernsResult, type IngotId, type OreItemId } from "@shared/caverns_mining";
import { useRingTakeover } from "./systems/boutStore";
import { RingsideModal } from "./components/hud/RingsideModal";
import { ProShopModal } from "./components/hud/ProShopModal";
import { SparModal } from "./components/hud/SparModal";
import { TouchControls } from "./components/hud/TouchControls";
import type { BoutResult } from "@shared/boxing";
import { installKeyboard } from "./systems/input";
import {
  ACHIEVEMENTS,
  EMOTES,
  isCasinoMap,
  isGatheringMap,
  type MapId,
  defaultLook,
  parseLook,
  parseStats,
  type BoardGameView,
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
    trees,
    worldEvent,
    incenseUntil,
    ores,
    caveEvent,
    caveRaft,
    claimPioneer,
    connected,
    connectionIssue,
    reconnect,
    reconnecting,
    loungeFull,
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
    boxingSend,
    splash,
    makeWish,
    matchaWhisk,
    setRecord,
    boardSend,
    kitchenSend,
    radioSend,
    plantSend,
    campfireSend,
    cavernsSend,
    groundSit,
    mochiPlay,
  } = useColyseusRoom(auth, lounge);
  // the lounge filled up before we got in (15 at most): back to the selector to pick another
  useEffect(() => {
    if (!loungeFull) return;
    forgetLounge();
    setLounge(null);
    pushToast("That lounge just filled up (15 players): pick another one", { emoji: "🚪" });
  }, [loungeFull]);

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
  const [boardView, setBoardView] = useState<BoardGameView | null>(null);
  const [mochiResult, setMochiResult] = useState<{ action: MochiAction; coins: number; cooldown: boolean } | null>(null);
  // the casino's tables open only when asked (the dock, or a click on the table): never by walking past
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [fortune, setFortune] = useState<FortuneResult | null>(null);
  // the resource drawers (the header's 🪵, 🪣 and ⛏️ gauges): B opens (and closes) the one opened
  // last, whenever nothing is being typed and no other panel is up; their logbooks open over them
  const lastDrawer = useRef<"carrier" | "livewell" | "satchel">("carrier");
  const [logbook, setLogbook] = useState<"fish" | "timber" | null>(null);
  // (the drawers are the gathering maps' only: the campfire, the woods, the beach)
  const gatherRef = useRef(false);
  // (M: the Cave Map, down in the caverns, whenever nothing is being typed and no other panel is up)
  const cavesRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !cavesRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      setPanel((p) => (p?.kind === "caveMap" ? null : p ? p : { kind: "caveMap", propId: "" }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyB" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !gatherRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      setPanel((p) => (p?.kind === "carrier" || p?.kind === "livewell" || p?.kind === "satchel" ? null : p ? p : { kind: lastDrawer.current, propId: lastDrawer.current }));
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
    if (kind === "carrier" || kind === "livewell" || kind === "satchel") lastDrawer.current = kind;
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
  gatherRef.current = isGatheringMap(currentMap);
  cavesRef.current = currentMap === "glimmering_caverns";
  // off to a world without drawers (the lounge, the casino, the ring): an open one closes
  useEffect(() => {
    if (!isGatheringMap(currentMap)) setPanel((p) => (p?.kind === "carrier" || p?.kind === "livewell" || p?.kind === "satchel" ? null : p));
    if (currentMap !== "glimmering_caverns") setPanel((p) => (p?.kind === "caveMap" ? null : p));
    // (a node's close-up never outlives the caverns)
    if (currentMap !== "glimmering_caverns") prospectStore.close();
  }, [currentMap]);
  // the Velvet Ring: a fighter's live bout takes the top of the screen (the header fades away)
  const ringTakeover = useRingTakeover(currentMap === "boxing_ring" ? localSessionId : null);
  // stepping into the ring from the chalkboard or Coach Bruno's counter: their panel closes
  const inRing = !!(localSessionId && players[localSessionId]?.corner);
  useEffect(() => {
    if (inRing) setPanel((p) => (p?.kind === "ringside" || p?.kind === "proshop" ? null : p));
  }, [inRing]);
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
        } else if (type === "drinkServed") {
          // a drink set down in front of you at the beach bar
          const d = payload as DrinkServed;
          if (d.to && d.to === localIdRef.current) {
            const drink = DRINKS[d.drink] as Drink;
            pushToast(d.grade === "sloppy" ? `Your ${drink.name}: a bit of a mess, but it's a drink` : `Your ${drink.name}${d.grade === "perfect" ? ", made to perfection" : ""}: Refreshed for 10 minutes`, { emoji: drink.emoji });
          }
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
              setReelReveal({ species: c.fish.s, name: info.name, emoji: info.emoji, tier: TIER_LABEL[gradeOf(c.fish.s)], tierColor: TIER_COLOR[gradeOf(c.fish.s)], cm: c.fish.cm, kg: fishKg(c.fish), stars: stars(c.fish.q), record: c.record, king: isKingSize(c.fish), released: c.released, locked: !!c.fish.l });
            if (c.released) pushToast(released > 0 ? `Livewell full! Released for +${released} coins` : "Livewell full! Released back to the water", { emoji: "🪣", tone: released > 0 ? "coin" : undefined });
            else if (!revealed) pushToast(`${c.afk ? "💤 " : ""}${info.name} · ${c.fish.cm} cm ${stars(c.fish.q)}${isKingSize(c.fish) ? " · King Size 👑" : ""}${c.record ? " · New personal best!" : ""}${c.fish.l ? " · 🔒 Auto-Locked" : ""}`, { emoji: c.record ? "🏆" : info.emoji, silent: c.afk && !c.record && !c.fish.l, tone: c.record || c.fish.l ? "win" : undefined });
            // a new personal best: the catch held high, and a chime
            if (c.record) playSfx("trophy");
            if (c.treasure > 0) pushToast(`Sunken treasure! +${c.treasure} coins`, { emoji: "🧰", tone: "coin" });
            // the finer fish's by-products, into the pouches (for the workbench's tackles and relics)
            if (c.prism) pushToast("A Prismatic Scale glints on the line!", { emoji: "🌈", tone: "win" });
            if (c.bone) pushToast("A Fine Fish Bone, into your pouches", { emoji: "🦴", silent: c.afk });
            playSfx("catch");
          }
        } else if (type === "creelFull") {
          // the line reeled in on its own, AFK off: a chime, and where to sell
          const f = payload as { capacity?: number; held?: number };
          playSfx("chime");
          pushToast(`Livewell full (${f.held ?? f.capacity ?? 0}/${f.capacity ?? 0})! Your line's reeled in: sell some fish to Barnaby, Finley or Finnegan`, { emoji: "🪣", silent: true });
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
        } else if (type === "caveProspect") {
          prospectStore.open(payload as CaveProspect);
        } else if (type === "caveProspectEnd") {
          prospectStore.close();
        } else if (type === "caveWeak") {
          const w = payload as { node: string; weak: [number, number, number]; glint?: boolean; from?: [number, number, number] };
          prospectStore.weak(w.node, w.weak, !!w.glint, w.from);
        } else if (type === "caveLoot") {
          const l = payload as CaveLoot;
          const what = (Object.entries(l.items) as [OreItemId, number][]).map(([id, n]) => `${ORE_ITEMS[id].emoji} ${n} ${ORE_ITEMS[id].name}`).join(" · ");
          if (l.clean) prospectStore.clean();
          if (what) pushToast(`${l.clean ? "Clean break! " : l.perfect ? "Perfect shatter! " : ""}${what}${l.mult > 1 ? ` (co-op +${Math.round((l.mult - 1) * 100)}%)` : ""}`, { emoji: "⛏️", tone: "coin", silent: true });
          if (l.lost > 0) pushToast(`Your satchel's full: ${l.lost} left behind in the rubble`, { emoji: "🎒" });
          if (l.items.core_fragment || l.items.pristine_geode) playSfx("jackpot");
        } else if (type === "caveForge") {
          const f = payload as { done: Partial<Record<IngotId, number>>; tray: number; left: number };
          const what = (Object.entries(f.done) as [IngotId, number][]).map(([id, n]) => `${n} ${ORE_ITEMS[id].name}${n > 1 ? "s" : ""}`).join(", ");
          if (what && panelKindRef.current !== "forge") pushToast(`The forge: ${what} ready${f.tray > 0 ? ` (${f.tray} on its tray: your satchel's full)` : ""}`, { emoji: "🔥", silent: f.tray === 0 });
        } else if (type === "cavernsResult") {
          // (the caverns' panels say so in their own)
          const r = payload as CavernsResult;
          const own = panelKindRef.current === "gus" || panelKindRef.current === "forge" || panelKindRef.current === "anvil";
          if (!own) pushToast(r.message, { emoji: r.ok ? "⛏️" : "🪨", tone: r.ok && (r.coins ?? 0) > 0 ? "coin" : undefined });
        } else if (type === "compassPulse") {
          // the Heartwood Compass stirs: a Colossal has risen (its pill under the header points the way)
          playSfx("chime");
          pushToast("Your Heartwood Compass hums: a Colossal has risen in the Whispering Woods", { emoji: "🧭" });
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
        } else if (type === "boxNotice") {
          // the Velvet Ring said no, or yes (a ticket in, gloves bought): its own panels say so there
          const n = payload as { message?: string; emoji?: string; ok?: boolean };
          const own = panelKindRef.current === "ringside" || panelKindRef.current === "proshop" || (panelKindRef.current === "spar" && !n?.ok);
          if (!own) pushToast(String(n?.message ?? ""), { emoji: n?.emoji ?? "🥊", tone: n?.ok ? "win" : undefined });
        } else if (type === "boxBelt") {
          // a belt won: the whole room hears of it, wherever they are
          const b = payload as { name: string; sessionId: string };
          if (b.sessionId === localIdRef.current) playSfx("jackpot");
          pushToast(b.sessionId === localIdRef.current ? "Three in a row: the Velvet Championship Belt is yours for 24 hours!" : `${b.name} won the Velvet Championship Belt at the Velvet Ring!`, { emoji: "🏆", tone: "win" });
        } else if (type === "boxResult") {
          const r = payload as BoutResult;
          const me = localIdRef.current ? allPlayersRef.current[localIdRef.current] : undefined;
          if (me && r.winner && r.winnerName === me.username) {
            if (r.method === "nocontest") pushToast("No Contest: no record, no purse, but the ring is still yours", { emoji: "🤚" });
            else pushToast(r.purse > 0 ? `You win by ${r.method === "decision" ? "decision" : "knockout"}! +${r.purse} coins purse${r.stays ? ": you hold the ring" : ""}` : `You win! (no purse left this hour)${r.stays ? " You hold the ring" : ""}`, { emoji: "🏆", tone: "win" });
          }
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
  // a blackjack panel stays open on one of its stools, or standing by the table to look on (the
  // hall's two tables and the penthouse's: the casino's two floors lie apart in the world)
  const atBlackjack = isCasinoMap(currentMap) && !!me && !!openTable && (openTable.stools.includes(mySeat) || Math.hypot(me.x - openTable.x, me.z - openTable.z) < openTable.reach + 0.8);
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
    setBoardView(null);
  }, [currentMap]);
  // the reel closes by itself if the server gave up on the line (timeout) or you stood up
  useEffect(() => {
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
  // (the Lamp Pack worn: the cave's glow round you, scene/caveGear.ts)
  lampBoost.value = lampGlow(angler.profile);
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
            trees={trees}
            worldEvent={worldEvent}
            ores={ores}
            caveEvent={caveEvent}
            caveRaft={caveRaft}
            onStrike={(node, dir, t) => cavernsSend(CAVERNS_CHANNELS.strike, { node, dir, seq: Date.now(), t })}
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
          away={ringTakeover}
        />
        <div className={ringTakeover ? "cozy-hud-away" : "cozy-hud-back"}>
          <WonderBadge worldEvent={worldEvent} incenseUntil={incenseUntil} currentMap={currentMap} gear={angler.profile} />
          {localPlayer && <BuffRow profile={angler.profile} />}
        </div>
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
            <ActionDock player={localPlayer} players={players} mapId={currentMap} chairs={chairs} toggleables={toggleables} localSessionId={localSessionId} hearth={hearth} machines={machines} ores={ores} raft={caveRaft} onWater={(plantId) => plantSend({ type: "PLANT_WATER", plantId })} onCampfire={campfireSend} onCasino={casinoSend} onCaverns={cavernsSend} subscribeMessages={subscribeMessages} />
          </div>
        )}

        {currentMap === "campfire_night" && localPlayer && !mapTransitioning && <CampfireStatus hearth={hearth} fed={localPlayer.fed} />}
        {/* the Velvet Ring: the scoreboard, a fighter's controls, the count, the result */}
        {currentMap === "boxing_ring" && localPlayer && localSessionId && !mapTransitioning && <BoxingHud me={localPlayer} localSessionId={localSessionId} players={players} send={boxingSend} subscribeMessages={subscribeMessages} />}
        {/* the Glimmering Caverns: prospecting's one control (the rock is the rest) */}
        {currentMap === "glimmering_caverns" && !mapTransitioning && <ProspectingHud send={cavernsSend} />}
        {/* ...and the warm pools' breathing, while you soak */}
        {currentMap === "glimmering_caverns" && localPlayer && !mapTransitioning && <SoakHud player={localPlayer} send={cavernsSend} subscribeMessages={subscribeMessages} />}
        {/* ...the Cave Codex's watch, the living wonder's pill, the photo */}
        {currentMap === "glimmering_caverns" && localPlayer && !mapTransitioning && <CaveCodexHud player={localPlayer} caveEvent={caveEvent} send={cavernsSend} subscribeMessages={subscribeMessages} />}
        {/* the floating joystick, on every map, on a touch screen */}
        <TouchControls enabled={!mapTransitioning} />

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
            mapId={currentMap}
            raining={weather === "rain"}
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
                  // (the rod's grip, and the Braided Silk Line's: the server's `resist`; and the
                  // Neoprene Wader Gloves: the tension builds a fifth slower again)
                  tensionResist: 1 - (1 - (starReel.resist ?? rod.tensionResist)) * (1 - tensionCut(angler.profile)),
                  tensionWindow: starReel.window ?? rod.tensionWindow,
                  boss: starReel.boss === true,
                  tele: starReel.tele ?? 0,
                  dart: starReel.dart ?? 0,
                  feints: starReel.feints ?? 0,
                  shields: starReel.shields ?? 0,
                  perk: starReel.perk,
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
        {panel?.kind === "jukebox" && <JukeboxModal playing={record} onPick={(t) => (setRecord(t), setPanel(null))} onClose={closePanel} />}
        {panel?.kind === "boardgame" && localSessionId && <BoardGameModal view={boardView} localSessionId={localSessionId} send={boardSend} onClose={closePanel} />}
        {panel?.kind === "kitchen" && <KitchenModal send={kitchenSend} onClose={closePanel} />}
        {panel?.kind === "radio" && <RadioModal radio={radio} send={radioSend} onClose={closePanel} />}
        {panel?.kind === "roast" && localSessionId && <RoastingModal send={campfireSend} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onClose={closePanel} />}
        {panel?.kind === "stargaze" && localSessionId && <StargazingModal send={campfireSend} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onClose={closePanel} />}
        {panel?.kind === "fell" && localSessionId && <FellingModal key={panel.propId} tree={panel.propId} send={campfireSend} subscribeMessages={subscribeMessages} localSessionId={localSessionId} onClose={closePanel} />}
        {panel?.kind === "splitblock" && <SplitBlockModal profile={angler.profile} send={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "slingshot" && <SlingshotModal send={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "bramble" && localPlayer && <BrambleModal profile={angler.profile} coins={localPlayer.coins} owned={localPlayer.owned} onBuyOutfit={(outfit: OutfitId) => buyOutfit(outfit)} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onOpenCollection={() => setLogbook("timber")} onClose={closePanel} />}
        {panel?.kind === "livewell" && <FishLivewellModal profile={angler.profile} market={market} send={campfireSend} onClose={closePanel} onOpenCollection={() => setLogbook("fish")} />}
        {logbook && <LogbookModal mode={logbook} profile={angler.profile} onClose={() => setLogbook(null)} />}
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
        {panel?.kind === "caveMap" && localPlayer && <CaveMapModal ores={ores} players={players} localSessionId={localSessionId} onClose={closePanel} />}
        {panel?.kind === "codex" && localPlayer && <CaveCodexModal found={angler.profile.codex} initial={panel.propId} title={localPlayer.title} onWear={(id) => casinoSend({ type: "EQUIP_TITLE", id })} onClose={closePanel} />}
        {panel?.kind === "satchel" && localPlayer && <OreSatchelDrawer profile={angler.profile} market={market} mapId={currentMap} send={cavernsSend} campfireSend={campfireSend} onClose={closePanel} />}
        {panel?.kind === "gus" && localPlayer && <GusShopModal profile={angler.profile} coins={localPlayer.coins} owned={localPlayer.owned} onBuyOutfit={(outfit: OutfitId) => buyOutfit(outfit)} market={market} send={cavernsSend} campfireSend={campfireSend} subscribeMessages={subscribeMessages} onOpenCollection={() => setLogbook("fish")} onClose={closePanel} />}
        {panel?.kind === "bartender" && localPlayer && <BeachBarModal profile={angler.profile} coins={localPlayer.coins} send={cavernsSend} onClose={closePanel} />}
        {panel?.kind === "barshift" && <BarShiftSheet key={panel.propId} station={panel.propId} send={cavernsSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "forge" && localPlayer && <ForgeModal profile={angler.profile} coins={localPlayer.coins} market={market} send={cavernsSend} campfireSend={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "anvil" && localPlayer && <GeodeModal profile={angler.profile} send={cavernsSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "flint" && localPlayer && <FlintModal first={panel.propId === "old_flint:first"} offer={panel.propId === "old_flint:offer"} profile={angler.profile} coins={localPlayer.coins} send={cavernsSend} onClose={closePanel} />}
        {panel?.kind === "carrier" && localPlayer && <WoodCarrierModal profile={angler.profile} bag={localPlayer.bag} market={market} send={campfireSend} onClose={closePanel} onOpenCollection={() => setLogbook("timber")} />}
        {panel?.kind === "workbench" && localPlayer && <WoodCraftModal profile={angler.profile} coins={localPlayer.coins} advanced={currentMap === "whispering_woods"} send={campfireSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
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
        {panel?.kind === "buster" && localPlayer && <LumberjackModal profile={angler.profile} coins={localPlayer.coins} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onOpenCollection={() => setLogbook("timber")} onClose={closePanel} />}
        {panel?.kind === "barnaby" && localPlayer && <BarnabyModal profile={angler.profile} coins={localPlayer.coins} fuel={hearth.fuel} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onOpenFieldGuide={() => setFieldGuideOpen(true)} onClose={closePanel} />}
        {panel?.kind === "finley" && localPlayer && <BarnabyModal keeper="finley" profile={angler.profile} coins={localPlayer.coins} fuel={hearth.fuel} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onOpenFieldGuide={() => setFieldGuideOpen(true)} onClose={closePanel} />}
        {panel?.kind === "finnegan" && localPlayer && <BarnabyModal keeper="finnegan" profile={angler.profile} coins={localPlayer.coins} fuel={0} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onOpenFieldGuide={() => setFieldGuideOpen(true)} onClose={closePanel} />}
        {panel?.kind === "dune" && localPlayer && <BarnabyModal keeper="dune" profile={angler.profile} coins={localPlayer.coins} fuel={0} market={market} send={campfireSend} subscribeMessages={subscribeMessages} onOpenFieldGuide={() => setFieldGuideOpen(true)} onClose={closePanel} />}

        {panel?.kind === "mochi" && <MochiPlayroomModal result={mochiResult} onPlay={mochiPlay} onClose={closePanel} />}
        {panel?.kind === "ringside" && localPlayer && localSessionId && <RingsideModal localSessionId={localSessionId} coins={localPlayer.coins} send={boxingSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "spar" && localSessionId && <SparModal localSessionId={localSessionId} send={boxingSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}
        {panel?.kind === "proshop" && localPlayer && <ProShopModal boxing={localPlayer.boxing} coins={localPlayer.coins} inRing={!!localPlayer.corner} send={boxingSend} subscribeMessages={subscribeMessages} onClose={closePanel} />}

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
