import { useEffect, useRef, useState, type ReactNode } from "react";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_IDS, ALLOWANCE_BELOW, TIMES_OF_DAY, isActivityStatus, type MapId, type TimeOfDay } from "@shared/types";
import { TIME_PRESETS } from "../../scene/roomThemes";
import { playChime, playClick, playCoin } from "../../audio/sfx";
import { useAnimatedNumber } from "./useAnimatedNumber";

export const MAP_LABELS: Record<MapId, { icon: string; name: string; tagline: string }> = {
  cozy_lounge: { icon: "🛋️", name: "Lounge", tagline: "Fireplace, games and tea" },
  campfire_night: { icon: "🔥", name: "Campfire", tagline: "A valley of tents and stars" },
  sunset_beach: { icon: "🏖️", name: "Beach Bar", tagline: "Surf, fishing and tiki drinks" },
  velvet_casino: { icon: "🎰", name: "Casino", tagline: "Roulette, blackjack and slots" },
  boxing_ring: { icon: "🥊", name: "Boxing Gym", tagline: "Slapstick bouts and bleachers" },
  japanese_onsen: { icon: "♨️", name: "Onsen", tagline: "Hot spring, tea and a wishing well" },
  retro_arcade: { icon: "🕹️", name: "Arcade", tagline: "Gachapon, the claw and old cabinets" },
};

interface HeaderProps {
  currentMap: MapId;
  playerCount: number;
  onOpenWorlds: () => void;
  timeOfDay: TimeOfDay;
  onSelectTime: (t: TimeOfDay) => void;
  autoCycle: boolean;
  onToggleAutoCycle: () => void;
  coins: number;
  /** The voice indicator, rendered inside the right-hand island so it never overlaps the header. */
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

/**
 * The unified dashboard across the top: where you are (opens the fast-travel drawer) with a
 * live head count, the hour, and you — coins that roll up, status, wardrobe, the High Rollers
 * board, sound, settings and the social drawer. Labels drop away on phones; every control
 * keeps a 48px tap target.
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
    <div ref={rootRef} className="font-cozy pointer-events-none fixed left-0 right-0 z-30 flex items-start justify-between gap-2 px-2" style={{ top: "max(10px, env(safe-area-inset-top))" }}>
      {/* where: one capsule holding the world badge and the head count */}
      <div className="pointer-events-auto clay-pill flex min-h-12 shrink-0 items-center gap-1 p-1">
        <button type="button" onClick={p.onOpenWorlds} className="flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-extrabold transition-transform hover:bg-white/10 active:scale-95" title="Fast travel">
          <span className="clay-wiggle text-xl">{map.icon}</span>
          <span className="hidden sm:inline">{map.name}</span>
          <span className="text-xs opacity-60">▾</span>
        </button>
        <span className="flex min-h-10 items-center gap-1.5 border-l border-white/10 pl-3 pr-2 text-xs font-bold" title="Players in this world">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
          {p.playerCount}
          <span className="hidden sm:inline">here</span>
        </span>
      </div>

      {/* the hour */}
      <div className="pointer-events-auto relative hidden md:block">
        <button type="button" onClick={() => toggle("time")} className="clay-pill flex min-h-12 items-center gap-2 px-4 text-sm font-bold transition-transform hover:scale-105 active:scale-95" aria-expanded={open === "time"}>
          <span className="text-lg">{time.icon}</span>
          <span>{p.autoCycle ? `${time.name} · Auto` : time.name}</span>
          <span className="text-xs opacity-60">▾</span>
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

      {/* you: an island whose parts never squash into each other (every child is shrink-0) */}
      <div className="pointer-events-auto clay-pill flex min-w-0 shrink-0 items-center gap-0.5 p-1">
        <div className="flex shrink-0 items-center gap-2 px-2">
          <CoinCounter coins={p.coins} onClaim={p.onClaimAllowance} />
        </div>
        <div className="relative shrink-0 border-l border-white/10 pl-1">
          <button type="button" onClick={() => toggle("status")} className="clay-icon-btn w-auto gap-1 px-2.5 text-sm font-bold hover:bg-white/10" title="Set your status" aria-expanded={open === "status"}>
            <span className="text-lg">{st ? st.emoji : "🟢"}</span>
            <span className="hidden lg:inline">{st ? st.label : "Status"}</span>
          </button>
          {open === "status" && (
            <Menu alignRight>
              <MenuItem active={!st} onClick={() => (playClick(), p.onSetStatus(""), setOpen(null))}>
                🟢 Just hanging out
              </MenuItem>
              {ACTIVITY_STATUS_IDS.map((id) => (
                <MenuItem key={id} active={p.status === id} onClick={() => (playClick(), p.onSetStatus(id), setOpen(null))}>
                  {ACTIVITY_STATUSES[id].emoji} {ACTIVITY_STATUSES[id].label}
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>
        {p.voiceSlot && <div className="hidden shrink-0 items-center border-l border-white/10 pl-1 md:flex">{p.voiceSlot}</div>}
        <button type="button" onClick={() => (playChime(), p.onOpenWardrobe())} className="clay-icon-btn shrink-0 hover:bg-white/10" title="Wardrobe">
          👗
        </button>
        <button type="button" onClick={() => (playClick(), p.onOpenLeaderboard())} className="clay-icon-btn hover:bg-white/10" title="High Rollers">
          🏆
        </button>
        <button type="button" onClick={() => (p.onToggleSound(), playClick())} className="clay-icon-btn hover:bg-white/10" aria-pressed={p.soundOn} title={p.soundOn ? "Mute the room" : "Play this room's ambience"}>
          {p.soundOn ? "🔊" : "🔇"}
        </button>
        <button type="button" onClick={() => (playClick(), p.onOpenSettings())} className="clay-icon-btn hover:bg-white/10" title="Settings">
          ⚙️
        </button>
        <button type="button" onClick={() => (playClick(), p.onOpenSocial())} className={`clay-icon-btn hover:bg-white/10 ${p.socialOpen ? "bg-white/15" : ""}`} title="Emotes, chat and who's here" aria-pressed={p.socialOpen}>
          💬
        </button>
      </div>
    </div>
  );
}

function Menu({ children, alignRight = false }: { children: ReactNode; alignRight?: boolean }) {
  return (
    <div className={`clay-panel clay-pop absolute top-[calc(100%+8px)] z-40 flex min-w-[190px] flex-col gap-0.5 p-1.5 ${alignRight ? "right-0" : "left-0"}`} role="menu">
      {children}
    </div>
  );
}

function MenuItem({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`min-h-11 rounded-2xl px-3 text-left text-sm font-bold transition-transform active:scale-95 ${active ? "bg-amber-300 text-amber-950" : "hover:bg-white/10"}`}>
      {children}
    </button>
  );
}

/** The wallet: rolls up or down to the new balance, chimes when it grows, offers a top-up when broke. */
function CoinCounter({ coins, onClaim }: { coins: number; onClaim: () => void }) {
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
    <span className="flex items-center gap-1">
      <span key={bump} className={`flex min-h-10 items-center gap-1.5 rounded-full bg-amber-300/25 px-3 text-sm font-extrabold tabular-nums text-amber-100 ${bump ? "cozy-coin-bump" : ""}`} title="Your coins">
        <span className="text-base">🪙</span>
        {shown}
      </span>
      {broke && (
        <button type="button" onClick={() => (playClick(), onClaim())} className="clay-btn clay-btn-mint min-h-10 px-3 text-xs" title="The house tops you up when you are out of coins">
          🎁 <span className="hidden sm:inline">Allowance</span>
        </button>
      )}
    </span>
  );
}
