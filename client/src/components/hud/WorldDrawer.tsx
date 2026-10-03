import { useEffect } from "react";
import type { MapId } from "@shared/types";
import { WORLDS, WORLD_ROWS, type WorldConfig } from "@shared/worlds";

// Illustrated fast travel: a drawer from the left with a little diorama card per world, two to a
// row and a theme per row (WORLD_ROWS). Everyone in the Discord server shares one room and walks
// its worlds on their own: a trip takes only you, each card counts who is there now, and a world
// whose scene is not built yet says "Soon" (and cannot be picked).
const ART: Record<MapId, { sky: string; ground: string; props: string[] }> = {
  cozy_lounge: { sky: "from-orange-200 to-rose-200", ground: "bg-amber-700", props: ["🛋️", "🪴", "📺", "☕"] },
  campfire_night: { sky: "from-indigo-900 to-violet-800", ground: "bg-emerald-900", props: ["⛺", "🔥", "🌲", "✨"] },
  whispering_woods: { sky: "from-emerald-950 to-teal-800", ground: "bg-green-900", props: ["🌲", "🪓", "🦌", "🍁"] },
  glimmering_caverns: { sky: "from-slate-950 to-violet-950", ground: "bg-stone-800", props: ["⛏️", "💎", "♨️", "🔥"] },
  sunset_beach: { sky: "from-orange-300 to-fuchsia-400", ground: "bg-yellow-200", props: ["🌴", "🍹", "🏄", "🐚"] },
  open_sea: { sky: "from-sky-400 to-blue-700", ground: "bg-blue-800", props: ["⛵", "🎣", "🐋", "🌊"] },
  hidden_cove: { sky: "from-slate-900 to-teal-800", ground: "bg-teal-900", props: ["🗺️", "🦪", "🐚", "✨"] },
  velvet_casino: { sky: "from-rose-950 to-red-900", ground: "bg-red-900", props: ["🎰", "🎡", "🃏", "🥂"] },
  casino_vip: { sky: "from-stone-950 to-amber-900", ground: "bg-stone-900", props: ["🥂", "🃏", "🎫", "🌃"] },
  boxing_ring: { sky: "from-indigo-950 to-rose-950", ground: "bg-[#6e1a2a]", props: ["🥊", "🔔", "🏆", "🎟️"] },
  japanese_onsen: { sky: "from-pink-200 to-emerald-200", ground: "bg-emerald-700", props: ["♨️", "🌸", "🍵", "🏮"] },
  retro_arcade: { sky: "from-fuchsia-800 to-indigo-950", ground: "bg-indigo-900", props: ["🕹️", "🔮", "🧸", "👾"] },
  gaming_cafe: { sky: "from-cyan-800 to-slate-900", ground: "bg-slate-700", props: ["🖥️", "🍜", "🎧", "⌨️"] },
};

/** How many are in a world: the casino's card counts its penthouse too. */
function countFor(world: WorldConfig, counts: Partial<Record<MapId, number>>): number {
  return (counts[world.mapId] ?? 0) + (world.mapId === "velvet_casino" ? (counts.casino_vip ?? 0) : 0) + (world.mapId === "campfire_night" ? (counts.whispering_woods ?? 0) + (counts.glimmering_caverns ?? 0) : 0);
}

export function WorldDrawer({ currentMap, counts, disabled, onSelect, onClose }: { currentMap: MapId; counts: Partial<Record<MapId, number>>; disabled: boolean; onSelect: (m: MapId) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" onPointerDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <aside className="clay-slide-left font-cozy absolute left-0 top-0 scrollbar-none flex h-full w-[min(560px,96vw)] flex-col gap-3 overflow-y-auto border-r border-white/10 bg-stone-900/85 p-4 pt-[max(16px,env(safe-area-inset-top))] text-stone-100 shadow-[12px_0_40px_rgba(0,0,0,0.5)] backdrop-blur-md" aria-label="Fast travel">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold tracking-wide">🗺️ Fast travel</h2>
          <button type="button" onClick={onClose} className="clay-close" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="text-xs opacity-70">Everyone in the server shares these worlds. A trip takes only you: friends stay where they are, and chat reaches every world.</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {WORLD_ROWS.map((row) => (
            <section key={row.theme} className="contents" aria-label={row.theme}>
              <h3 className="col-span-2 mt-1 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200/70">{row.theme}</h3>
              {row.worlds.map((id) => (
                <WorldCard key={id} world={WORLDS[id]} here={WORLDS[id].mapId === currentMap || (id === "casino" && currentMap === "casino_vip")} playerCount={countFor(WORLDS[id], counts)} disabled={disabled || !WORLDS[id].built} onPick={() => {
                  if (WORLDS[id].mapId !== currentMap && WORLDS[id].built) onSelect(WORLDS[id].mapId);
                  onClose();
                }} />
              ))}
            </section>
          ))}
        </div>
        <button type="button" onClick={() => (onClose())} className="clay-btn clay-btn-ghost mt-auto">
          Stay here
        </button>
      </aside>
    </div>
  );
}

/** One world's card: a little diorama over its name and line, with its badges. */
function WorldCard({ world, here, playerCount, disabled, onPick }: { world: WorldConfig; here: boolean; playerCount: number; disabled: boolean; onPick: () => void }) {
  const art = ART[world.mapId];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-current={here ? "true" : undefined}
      className={`group relative min-w-0 overflow-hidden rounded-3xl border text-left shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(0,0,0,0.35)] active:translate-y-0 active:scale-[0.98] disabled:opacity-50 ${here ? "border-amber-300/70 ring-2 ring-amber-300/50" : "border-white/10"}`}
    >
      <div className={`relative h-16 bg-gradient-to-b ${art.sky}`}>
        <div className={`absolute inset-x-0 bottom-0 h-8 ${art.ground} [clip-path:polygon(0_40%,100%_10%,100%_100%,0_100%)]`} />
        {art.props.map((emoji, i) => (
          <span key={emoji} className="absolute text-xl drop-shadow transition-transform duration-200 group-hover:-translate-y-0.5" style={{ left: `${10 + i * 22}%`, bottom: `${6 + (i % 2) * 10}px`, transform: `rotate(${(i - 1.5) * 4}deg)` }}>
            {emoji}
          </span>
        ))}
        {/* where you are, who is where, and the worlds still being built */}
        {here ? <Badge className="bg-amber-300 text-amber-950">Here · 👥 {playerCount}</Badge> : !world.built ? <Badge className="bg-stone-900/70 text-stone-200">Soon</Badge> : playerCount > 0 && <Badge className="bg-emerald-300 text-emerald-950">👥 {playerCount}</Badge>}
      </div>
      <div className="flex items-start gap-2 px-3 py-2">
        {/* the icon gives its room back on a phone-narrow card */}
        <span className="hidden text-xl leading-none min-[420px]:inline">{world.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold">{world.name}</span>
          <span className="line-clamp-2 text-[11px] leading-snug opacity-70">{world.tagline}</span>
        </span>
      </div>
    </button>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  // top-left: the scene's props rise highest on the right
  return <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide shadow-sm ${className}`}>{children}</span>;
}
