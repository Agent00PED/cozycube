import { useEffect } from "react";
import { MAP_IDS, type MapId } from "@shared/types";
import { MAP_LABELS } from "./Header";

// Illustrated fast travel: a drawer from the left with a little diorama card per world. The
// whole voice channel shares one room, so "active" is where everyone is right now.
const ART: Record<MapId, { sky: string; ground: string; props: string[] }> = {
  cozy_lounge: { sky: "from-orange-200 to-rose-200", ground: "bg-amber-700", props: ["🛋️", "🪴", "📺", "☕"] },
  campfire_night: { sky: "from-indigo-900 to-violet-800", ground: "bg-emerald-900", props: ["⛺", "🔥", "🌲", "✨"] },
  sunset_beach: { sky: "from-orange-300 to-fuchsia-400", ground: "bg-yellow-200", props: ["🌴", "🍹", "🏄", "🐚"] },
  velvet_casino: { sky: "from-rose-950 to-red-900", ground: "bg-red-900", props: ["🎰", "🎡", "🃏", "🥂"] },
  boxing_ring: { sky: "from-slate-700 to-slate-900", ground: "bg-red-800", props: ["🥊", "🔔", "🏆", "🐦"] },
  japanese_onsen: { sky: "from-pink-200 to-emerald-200", ground: "bg-emerald-700", props: ["♨️", "🌸", "🍵", "🏮"] },
  retro_arcade: { sky: "from-fuchsia-800 to-indigo-950", ground: "bg-indigo-900", props: ["🕹️", "🔮", "🧸", "👾"] },
};

export function WorldDrawer({ currentMap, playerCount, disabled, onSelect, onClose }: { currentMap: MapId; playerCount: number; disabled: boolean; onSelect: (m: MapId) => void; onClose: () => void }) {
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
          <button type="button" onClick={onClose} className="clay-icon-btn bg-white/10 hover:bg-white/20" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="text-xs opacity-70">Everyone in the channel travels together. Pick a world and the whole room comes along.</p>
        <div className="grid grid-cols-2 gap-3">
        {MAP_IDS.map((id) => {
          const here = id === currentMap;
          const art = ART[id];
          const label = MAP_LABELS[id];
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (here) return onClose();
                onSelect(id);
                onClose();
              }}
              className={`group relative shrink-0 overflow-hidden rounded-3xl border text-left transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${here ? "border-amber-300/70 ring-2 ring-amber-300/50" : "border-white/10"}`}
            >
              <div className={`relative h-16 bg-gradient-to-b ${art.sky}`}>
                <div className={`absolute inset-x-0 bottom-0 h-8 ${art.ground} [clip-path:polygon(0_40%,100%_10%,100%_100%,0_100%)]`} />
                {art.props.map((emoji, i) => (
                  <span key={emoji} className="absolute text-xl drop-shadow" style={{ left: `${10 + i * 22}%`, bottom: `${6 + (i % 2) * 10}px`, transform: `rotate(${(i - 1.5) * 4}deg)` }}>
                    {emoji}
                  </span>
                ))}
                {here && <span className="absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-amber-950">Here</span>}
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-xl">{label.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{label.name}</span>
                  <span className="block truncate text-[11px] opacity-70">{label.tagline}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${here ? "bg-emerald-400/25 text-emerald-200" : "bg-white/10 opacity-70"}`}>👥 {here ? playerCount : 0}</span>
              </div>
            </button>
          );
        })}
        </div>
        <button type="button" onClick={() => (onClose())} className="clay-btn clay-btn-ghost mt-auto">
          Stay here
        </button>
      </aside>
    </div>
  );
}
