import { WORLDS, WORLD_IDS } from "@shared/worlds";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_IDS, ALLOWANCE_BELOW, TIMES_OF_DAY, isActivityStatus, type MapId, type TimeOfDay } from "@shared/types";
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
  onClaimAllowance: () => void;
  status: string;
  onSetStatus: (status: string) => void;
  onOpenWardrobe: () => void;
  onOpenLeaderboard: () => void;
  onOpenSettings: () => void;
  onOpenSocial: () => void;
  socialOpen: boolean;
}

const TIME_LABELS: Record<TimeOfDay, string> = { sunrise: "🌅 Sunrise", day: "☀️ Day", sunset: "🌇 Sunset", night: "🌙 Night" };

function timeLabel(time: TimeOfDay) {
  const [icon, ...rest] = TIME_LABELS[time].split(" ");
  return { icon, name: rest.join(" ") };
}

// The top bar's pill system. Every capsule is 40px tall (a comfortable touch target), centred, in the
// same warm frosted stone with the same clay bevel; labels share one weight, icons one size.
// PILL_SHELL is the capsule alone, so a container can set its own padding; PRESS is the shared
// hover and press feel; ICON_PILL is a round 40x40 button. The edge is an outline, not a border:
// it takes no room, so a button filling a pill gets the full 40px.
const PILL_SHELL = "clay-pill-soft flex h-10 shrink-0 items-center whitespace-nowrap rounded-full outline outline-1 -outline-offset-1 outline-white/10 bg-stone-800/80 text-sm font-semibold leading-none text-stone-100";
const PRESS = "transition-transform duration-150 hover:bg-stone-700/80 active:scale-95";
const ICON_PILL = `${PILL_SHELL} ${PRESS} w-10 justify-center`;
const ICON = "text-lg leading-none";

/**
 * The top bar: one line at every width, built from 40px pills.
 *   - phones (< 640px): the world badge and the wallet, and a ☰ that opens a sheet with
 *     everything else (the four actions as big labelled tiles, the hour, your status);
 *   - tablets (640px up): every control as its own icon pill, the four actions 8px apart;
 *   - from 1024px the world's name and your status get their labels, and from 1280px the hour
 *     too. Voice has no control here: who is speaking shows as the green rings at their feet.
 */
export function Header(p: HeaderProps) {
  const [open, setOpen] = useState<"time" | "status" | "more" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);
  const toggle = (menu: "time" | "status" | "more") => {
    setOpen((o) => (o === menu ? null : menu));
  };
  // the campfire is always a starlit night: its hour does not follow the room's clock
  const starlit = p.currentMap === "campfire_night";
  const time = starlit ? { icon: "🌙", name: "Starlight" } : timeLabel(p.timeOfDay);
  const st = isActivityStatus(p.status) ? ACTIVITY_STATUSES[p.status] : null;
  const map = MAP_LABELS[p.currentMap];
  const actions: { icon: string; label: string; title?: string; onClick: () => void; active?: boolean }[] = [
    { icon: "👗", label: "Wardrobe", onClick: p.onOpenWardrobe },
    { icon: "🏆", label: "High Rollers", onClick: p.onOpenLeaderboard },
    { icon: "⚙️", label: "Settings", onClick: p.onOpenSettings },
    { icon: "💬", label: "Social", title: "Emotes, chat and who's here", onClick: p.onOpenSocial, active: p.socialOpen },
  ];

  return (
    <div ref={rootRef} className="font-cozy pointer-events-none fixed left-0 right-0 z-30 flex flex-nowrap items-center justify-between gap-2" style={{ top: "max(8px, env(safe-area-inset-top))", paddingRight: "max(8px, env(safe-area-inset-right))", paddingLeft: "max(8px, env(safe-area-inset-left))" }}>
      {/* ---- left: the world and who is in it, one capsule ---- */}
      <div className={`pointer-events-auto ${PILL_SHELL}`}>
        <button type="button" onClick={() => p.onOpenWorlds()} className="flex h-full min-w-10 items-center justify-center gap-2 rounded-full pl-3 pr-2.5 transition-transform duration-150 hover:bg-white/10 active:scale-95 lg:pl-3.5" title="Fast travel" aria-haspopup="dialog" aria-label={`${map.name}: fast travel`}>
          <span className={`clay-wiggle ${ICON}`}>{map.icon}</span>
          <span className="hidden lg:inline">{map.name}</span>
          <span className="hidden text-xs opacity-60 lg:inline">▾</span>
        </button>
        <span className="flex h-full items-center gap-2 border-l border-white/10 pl-2.5 pr-3.5" title="Players in this world">
          <span className="clay-ring-dot" aria-hidden />
          <span>
            {p.playerCount} <span className="hidden lg:inline">here</span>
          </span>
        </span>
      </div>

      {/* ---- centre: the hour (a pill from 640px; on phones it is in the ☰ sheet) ---- */}
      <div className="pointer-events-auto relative hidden shrink-0 sm:block">
        <button type="button" onClick={() => toggle("time")} className={`${ICON_PILL} gap-2 xl:w-auto xl:px-3.5`} title={starlit ? "Always a starlit night by the campfire" : `${time.name}${p.autoCycle ? " · Auto" : ""}: day and night`} aria-label="Day and night" aria-expanded={open === "time"} aria-haspopup="menu">
          <span className={ICON}>{time.icon}</span>
          <span className="hidden xl:inline">{p.autoCycle && !starlit ? `${time.name} · Auto` : time.name}</span>
          <span className="hidden text-xs opacity-60 xl:inline">▾</span>
        </button>
        {open === "time" && (
          <Menu>
            <TimeChoices p={p} close={() => setOpen(null)} />
          </Menu>
        )}
      </div>

      {/* ---- right: you ---- */}
      <div className="pointer-events-auto ml-auto flex shrink-0 flex-nowrap items-center gap-2">
        <CoinWallet coins={p.coins} onClaim={p.onClaimAllowance} />

        <div className="relative hidden shrink-0 sm:block">
          <button type="button" onClick={() => toggle("status")} className={`${ICON_PILL} gap-2 lg:w-auto lg:px-3.5`} title={st ? `Status: ${st.label}` : "Set your status"} aria-label="Status" aria-expanded={open === "status"} aria-haspopup="menu">
            <span className={ICON}>{st ? st.emoji : "🟢"}</span>
            <span className="hidden lg:inline">{st ? st.label : "Status"}</span>
            <span className="hidden text-xs opacity-60 lg:inline">▾</span>
          </button>
          {open === "status" && (
            <Menu alignRight>
              <StatusChoices status={p.status} onSetStatus={p.onSetStatus} close={() => setOpen(null)} />
            </Menu>
          )}
        </div>


        <div className="hidden items-center gap-2 sm:flex" role="toolbar" aria-label="Wardrobe, High Rollers, settings and social">
          {actions.map((a) => (
            <button key={a.label} type="button" onClick={() => a.onClick()} className={`${ICON_PILL} ${a.active ? "bg-stone-600/90" : ""}`} title={a.title ?? a.label} aria-label={a.title ?? a.label} aria-pressed={a.active}>
              <span className={ICON}>{a.icon}</span>
            </button>
          ))}
        </div>

        {/* phones: everything else behind one button */}
        <div className="relative sm:hidden">
          <button type="button" onClick={() => toggle("more")} className={ICON_PILL} title="More" aria-label="More" aria-expanded={open === "more"} aria-haspopup="menu">
            <span className={ICON}>{open === "more" ? "✕" : "☰"}</span>
          </button>
          {open === "more" && (
            <div className="clay-panel clay-pop absolute right-0 top-[calc(100%+8px)] z-40 flex w-[min(20rem,calc(100vw-16px))] flex-col gap-3 p-3" role="menu">
              <div className="grid grid-cols-2 gap-2">
                {actions.map((a) => (
                  <button key={a.label} type="button" role="menuitem" onClick={() => (a.onClick(), setOpen(null))} className={`flex h-12 items-center gap-2 rounded-2xl px-3 text-left text-sm font-semibold transition-transform duration-150 active:scale-95 ${a.active ? "bg-amber-300 text-amber-950" : "bg-white/10 hover:bg-white/15"}`}>
                    <span className={ICON}>{a.icon}</span>
                    {a.label}
                  </button>
                ))}
              </div>
              <SheetSection title="Time of day">
                <TimeChoices p={p} close={() => setOpen(null)} chips />
              </SheetSection>
              <SheetSection title="Status">
                <StatusChoices status={p.status} onSetStatus={p.onSetStatus} close={() => setOpen(null)} chips />
              </SheetSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-widest opacity-60">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** The hours and the auto cycle, as a menu's rows or (in the phone sheet) as chips. */
function TimeChoices({ p, close, chips = false }: { p: HeaderProps; close: () => void; chips?: boolean }) {
  if (p.currentMap === "campfire_night") {
    return <p className={`m-0 whitespace-nowrap px-3 py-2 text-sm font-semibold opacity-80 ${chips ? "" : "text-left"}`}>🌙 Always a starlit night by the campfire</p>;
  }
  return (
    <>
      {TIMES_OF_DAY.map((t) => {
        const l = timeLabel(t);
        return (
          <MenuItem key={t} chip={chips} active={t === p.timeOfDay && !p.autoCycle} onClick={() => (p.onSelectTime(t), close())}>
            {l.icon} {l.name}
          </MenuItem>
        );
      })}
      {!chips && <div className="my-1 h-px bg-white/10" />}
      <MenuItem chip={chips} active={p.autoCycle} onClick={() => p.onToggleAutoCycle()}>
        ⏱️ Auto {chips ? "" : "cycle "}
        {p.autoCycle ? "on" : "off"}
      </MenuItem>
    </>
  );
}

function StatusChoices({ status, onSetStatus, close, chips = false }: { status: string; onSetStatus: (s: string) => void; close: () => void; chips?: boolean }) {
  const st = isActivityStatus(status) ? ACTIVITY_STATUSES[status] : null;
  return (
    <>
      <MenuItem chip={chips} active={!st} onClick={() => (onSetStatus(""), close())}>
        🟢 Just hanging out
      </MenuItem>
      {ACTIVITY_STATUS_IDS.map((id) => (
        <MenuItem key={id} chip={chips} active={status === id} onClick={() => (onSetStatus(id), close())}>
          {ACTIVITY_STATUSES[id].emoji} {ACTIVITY_STATUSES[id].label}
        </MenuItem>
      ))}
    </>
  );
}

function Menu({ children, alignRight = false }: { children: ReactNode; alignRight?: boolean }) {
  return (
    <div className={`clay-panel clay-pop absolute top-[calc(100%+8px)] z-40 flex min-w-[200px] flex-col gap-0.5 p-1.5 ${alignRight ? "right-0" : "left-0"}`} role="menu">
      {children}
    </div>
  );
}

function MenuItem({ children, active, onClick, chip = false }: { children: ReactNode; active: boolean; onClick: () => void; chip?: boolean }) {
  const shape = chip ? "rounded-full px-3" : "rounded-2xl px-3 text-left";
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`min-h-10 whitespace-nowrap text-sm font-semibold transition-transform duration-150 active:scale-95 ${shape} ${active ? "bg-amber-300 text-amber-950" : chip ? "bg-white/10 hover:bg-white/15" : "hover:bg-white/10"}`}>
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
    }
    prev.current = coins;
  }, [coins]);
  const broke = coins < ALLOWANCE_BELOW;
  return (
    <div className={`${PILL_SHELL} gap-2 ${broke ? "pl-3.5 pr-1.5" : "px-3.5"}`} title="Your coins">
      <span key={bump} className={`flex items-center gap-1.5 font-bold tabular-nums text-amber-100 ${bump ? "cozy-coin-bump" : ""}`}>
        <span className={`clay-coin ${ICON}`}>🪙</span>
        {shown}
      </span>
      {broke && (
        <button type="button" onClick={() => onClaim()} className="flex h-8 items-center gap-1 rounded-full bg-gradient-to-b from-emerald-200 to-emerald-400 px-2.5 text-xs font-semibold text-emerald-950 transition-transform duration-150 active:scale-95" title="The house tops you up when you are out of coins">
          🎁 <span className="hidden lg:inline">Allowance</span>
        </button>
      )}
    </div>
  );
}
