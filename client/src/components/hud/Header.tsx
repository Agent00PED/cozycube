import { WORLDS, WORLD_IDS } from "@shared/worlds";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_IDS, ALLOWANCE_BELOW, TIMES_OF_DAY, isActivityStatus, type MapId, type TimeOfDay } from "@shared/types";
import { TIME_PRESETS } from "../../scene/roomThemes";
import { playChime, playClick, playCoin } from "../../audio/sfx";
import { useAnimatedNumber } from "./useAnimatedNumber";

/** Each map's icon, name and tagline, from the world table (shared/worlds). */
export const MAP_LABELS: Record<MapId, { icon: string; name: string; tagline: string }> = Object.fromEntries(
  WORLD_IDS.map((id) => [WORLDS[id].mapId, { icon: WORLDS[id].icon, name: WORLDS[id].name, tagline: WORLDS[id].tagline }])
) as Record<MapId, { icon: string; name: string; tagline: string }>;

interface HeaderProps {
  currentMap: MapId;
  playerCount: number;
  onOpenWorlds: () => void;
  timeOfDay: TimeOfDay;
  onSelectTime: (t: TimeOfDay) => void;
  autoCycle: boolean;
  onToggleAutoCycle: () => void;
  coins: number;
  /** The voice indicator: a companion pill in the right-hand cluster, never a floating chip. */
  voiceSlot?: ReactNode;
  onClaimAllowance: () => void;
  status: string;
  onSetStatus: (status: string) => void;
  onOpenWardrobe: () => void;
  onOpenLeaderboard: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenSettings: () => void;
  onOpenSocial: () => void;
  socialOpen: boolean;
}

function timeLabel(time: TimeOfDay) {
  const [icon, ...rest] = TIME_PRESETS[time].label.split(" ");
  return { icon, name: rest.join(" ") };
}

// The pill every cluster is built from: a warm frosted capsule that never shrinks, so nothing
// in the bar can be squeezed into its neighbour. Text inside never wraps.
// PILL_SHELL is the capsule itself (no spacing, so a container can set its own padding and gap
// without fighting Tailwind's cascade); PILL adds the standard spacing, which tightens below sm
// so a phone still fits the whole bar on ONE line.
const PILL_SHELL = "clay-pill-soft shrink-0 flex items-center whitespace-nowrap rounded-full border border-white/10 bg-stone-800/80 text-stone-100";
const PILL = `${PILL_SHELL} gap-1.5 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5`;
const PILL_BUTTON = `${PILL} min-h-10 transition-transform duration-150 hover:bg-stone-700/80 active:scale-95 sm:min-h-11`;

/**
 * The top bar: ONE horizontal line at every width, never a second row of pills over the canvas.
 * Three clusters that cannot collide: where you are (left), the hour (centre, from md up), and
 * you (right: wallet, status, voice, the action row). Everything is flex-nowrap and shrink-0;
 * what gives way on a phone is the text (world name, "here", "Status", the voice label), the
 * padding, and two controls that also live elsewhere (the voice chip below sm, sound below sm:
 * it is in Settings). Tap targets stay at least 40px.
 */
export function Header(p: HeaderProps) {
  const [open, setOpen] = useState<"time" | "status" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);
  const toggle = (menu: "time" | "status") => {
    playClick();
    setOpen((o) => (o === menu ? null : menu));
  };
  const time = timeLabel(p.timeOfDay);
  const st = isActivityStatus(p.status) ? ACTIVITY_STATUSES[p.status] : null;
  const map = MAP_LABELS[p.currentMap];

  return (
    <div ref={rootRef} className="font-cozy pointer-events-none fixed left-0 right-0 z-30 flex flex-nowrap items-center justify-between gap-1 sm:gap-3" style={{ top: "max(8px, env(safe-area-inset-top))", paddingRight: "max(8px, env(safe-area-inset-right))", paddingLeft: "max(8px, env(safe-area-inset-left))" }}>
      {/* ---- left cluster: the world and who is in it, one capsule ---- */}
      <div className={`pointer-events-auto ${PILL_SHELL} p-0.5 sm:p-1`}>
        <button type="button" onClick={() => (playChime(), p.onOpenWorlds())} className="flex min-h-9 items-center gap-1.5 rounded-full px-2 text-sm font-extrabold transition-transform duration-150 hover:bg-white/10 active:scale-95 sm:min-h-10 sm:gap-2 sm:px-3" title="Fast travel" aria-haspopup="dialog">
          <span className="clay-wiggle text-xl leading-none">{map.icon}</span>
          <span className="hidden lg:inline">{map.name}</span>
          <span className="hidden text-xs opacity-60 lg:inline">▾</span>
        </button>
        <span className="flex min-h-9 items-center gap-1.5 border-l border-white/10 pl-2 pr-2 text-xs font-bold sm:min-h-10 sm:pl-3 sm:pr-3" title="Players in this world">
          <span className="clay-ring-dot" aria-hidden />
          <span>
            {p.playerCount} <span className="hidden lg:inline">here</span>
          </span>
        </span>
      </div>

      {/* ---- centre cluster: the hour. Present at every width: icon-only until lg, then the name too. ---- */}
      <div className="pointer-events-auto relative shrink-0">
        <button type="button" onClick={() => toggle("time")} className={`${PILL_SHELL} min-h-10 gap-1 px-1.5 py-1 text-sm font-bold transition-transform duration-150 hover:bg-stone-700/80 active:scale-95 sm:min-h-11 sm:gap-2 sm:px-3 lg:px-4`} title={`${time.name}${p.autoCycle ? " · Auto" : ""} — day and night`} aria-label="Day and night" aria-expanded={open === "time"} aria-haspopup="menu">
          <span className="text-lg leading-none">{time.icon}</span>
          <span className="hidden lg:inline">{p.autoCycle ? `${time.name} · Auto` : time.name}</span>
          <span className="hidden text-xs opacity-60 lg:inline">▾</span>
        </button>
        {open === "time" && (
          <Menu>
            {TIMES_OF_DAY.map((t) => {
              const l = timeLabel(t);
              return (
                <MenuItem key={t} active={t === p.timeOfDay && !p.autoCycle} onClick={() => (playClick(), p.onSelectTime(t), setOpen(null))}>
                  {l.icon} {l.name}
                </MenuItem>
              );
            })}
            <div className="my-1 h-px bg-white/10" />
            <MenuItem active={p.autoCycle} onClick={() => (playClick(), p.onToggleAutoCycle())}>
              ⏱️ Auto cycle {p.autoCycle ? "on" : "off"}
            </MenuItem>
          </Menu>
        )}
      </div>

      {/* ---- right cluster: you. Self-contained pills in one non-wrapping row; none can eat another. ---- */}
      <div className="pointer-events-auto ml-auto flex shrink-0 flex-nowrap items-center gap-1 md:gap-2">
        <CoinWallet coins={p.coins} onClaim={p.onClaimAllowance} />

        <div className="relative hidden shrink-0 sm:block">
          <button type="button" onClick={() => toggle("status")} className={`${PILL_BUTTON} text-sm font-bold`} title={st ? `Status: ${st.label}` : "Set your status"} aria-expanded={open === "status"} aria-haspopup="menu">
            <span className="text-lg leading-none">{st ? st.emoji : "🟢"}</span>
            <span>{st ? st.label : "Status"}</span>
            <span className="hidden text-xs opacity-60 lg:inline">▾</span>
          </button>
          {open === "status" && <StatusMenu status={p.status} onSetStatus={p.onSetStatus} close={() => setOpen(null)} />}
        </div>

        {p.voiceSlot && <div className="hidden shrink-0 sm:block">{p.voiceSlot}</div>}

        <div className={`${PILL_SHELL} gap-0 p-0.5 sm:gap-1 sm:p-1`} role="toolbar" aria-label="Status, wardrobe, High Rollers, sound, settings and social">
          {/* phones: the status dot folds into the toolbar so the bar stays one line */}
          <div className="relative sm:hidden">
            <IconButton onClick={() => toggle("status")} title={st ? `Status: ${st.label}` : "Status"} pressed={open === "status"}>
              {st ? st.emoji : "🟢"}
            </IconButton>
            {open === "status" && <StatusMenu status={p.status} onSetStatus={p.onSetStatus} close={() => setOpen(null)} />}
          </div>
          <IconButton onClick={() => (playChime(), p.onOpenWardrobe())} title="Wardrobe">
            👗
          </IconButton>
          <IconButton onClick={() => (playClick(), p.onOpenLeaderboard())} title="High Rollers">
            🏆
          </IconButton>
          <IconButton onClick={() => (p.onToggleSound(), playClick())} title={p.soundOn ? "Mute the room" : "Play this room's ambience"} pressed={p.soundOn} hideOnPhone>
            {p.soundOn ? "🔊" : "🔇"}
          </IconButton>
          <IconButton onClick={() => (playClick(), p.onOpenSettings())} title="Settings">
            ⚙️
          </IconButton>
          <IconButton onClick={() => (playClick(), p.onOpenSocial())} title="Emotes, chat and who's here" pressed={p.socialOpen} active={p.socialOpen}>
            💬
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, onClick, title, pressed, active = false, hideOnPhone = false }: { children: ReactNode; onClick: () => void; title: string; pressed?: boolean; active?: boolean; /** Dropped below sm when the same control exists elsewhere (sound lives in Settings). */ hideOnPhone?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`${hideOnPhone ? "hidden sm:flex" : "flex"} h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none transition-transform duration-150 hover:bg-white/10 active:scale-90 sm:h-9 sm:w-9 lg:h-10 lg:w-10 lg:text-lg ${active ? "bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" : ""}`} title={title} aria-label={title} aria-pressed={pressed}>
      {children}
    </button>
  );
}

function StatusMenu({ status, onSetStatus, close }: { status: string; onSetStatus: (s: string) => void; close: () => void }) {
  const st = isActivityStatus(status) ? ACTIVITY_STATUSES[status] : null;
  return (
    <Menu alignRight>
      <MenuItem active={!st} onClick={() => (playClick(), onSetStatus(""), close())}>
        🟢 Just hanging out
      </MenuItem>
      {ACTIVITY_STATUS_IDS.map((id) => (
        <MenuItem key={id} active={status === id} onClick={() => (playClick(), onSetStatus(id), close())}>
          {ACTIVITY_STATUSES[id].emoji} {ACTIVITY_STATUSES[id].label}
        </MenuItem>
      ))}
    </Menu>
  );
}

function Menu({ children, alignRight = false }: { children: ReactNode; alignRight?: boolean }) {
  return (
    <div className={`clay-panel clay-pop absolute top-[calc(100%+8px)] z-40 flex min-w-[200px] flex-col gap-0.5 p-1.5 ${alignRight ? "right-0" : "left-0"}`} role="menu">
      {children}
    </div>
  );
}

function MenuItem({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`min-h-11 whitespace-nowrap rounded-2xl px-3 text-left text-sm font-bold transition-transform duration-150 active:scale-95 ${active ? "bg-amber-300 text-amber-950" : "hover:bg-white/10"}`}>
      {children}
    </button>
  );
}

/** The wallet: its own capsule. Rolls to the new balance, chimes when it grows, offers a top-up when broke. */
function CoinWallet({ coins, onClaim }: { coins: number; onClaim: () => void }) {
  const shown = useAnimatedNumber(coins);
  const prev = useRef(coins);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (coins > prev.current) {
      setBump((b) => b + 1);
      playCoin();
    }
    prev.current = coins;
  }, [coins]);
  const broke = coins < ALLOWANCE_BELOW;
  return (
    <div className={`${PILL_SHELL} min-h-10 gap-1 px-1.5 py-1 sm:min-h-11 sm:gap-1.5 sm:px-3 sm:py-1.5`} title="Your coins">
      <span key={bump} className={`flex items-center gap-1 text-sm font-extrabold tabular-nums text-amber-100 sm:gap-1.5 ${bump ? "cozy-coin-bump" : ""}`}>
        <span className="clay-coin text-base leading-none">🪙</span>
        {shown}
      </span>
      {broke && (
        <button type="button" onClick={() => (playClick(), onClaim())} className="clay-btn clay-btn-mint min-h-9 min-w-0 px-2.5 text-xs" title="The house tops you up when you are out of coins">
          🎁 <span className="hidden lg:inline">Allowance</span>
        </button>
      )}
    </div>
  );
}
